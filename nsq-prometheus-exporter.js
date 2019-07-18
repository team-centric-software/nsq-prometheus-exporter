#!/usr/bin/env node

const http = require("http");
const NsqWatch = require("nsq-watch");
const prometheus = require("prom-client");

const config = require("./lib/config");
const utils = require("./lib/utils");

// log config at startup
console.log(require("./lib/config").toString());

// internal state, mostly metric objects and config
const state = {
	nodes: new Map(),
	topics: new Map(),
	channels: new Map(),
	metrics: {
		nsqdNodeGauge: new prometheus.Gauge({
			name: "nsq_nsqd_node_count",
			help: "The amount of active nsqd nodes in our cluster",
		}),
		errorCounter: new prometheus.Counter({
			name: "nsq_watcher_error_count",
			help: "The amount of errors nsq-watcher fired since the process started",
		}),
		topicDepthGauge: new prometheus.Gauge({
			name: "nsq_topic_depth",
			help: "Depth of a specific nsq topic on a specific nsqd, this occures when there is no channel to receive published messages",
			labelNames: ["topic", "node"],
		}),
		topicMsgCountGauge: new prometheus.Gauge({
			name: "nsq_message_count",
			help: "Message count of a specific nsq topic on a specific nsqd",
			labelNames: ["topic", "node"],
		}),
		channelDepthGauge: new prometheus.Gauge({
			name: "nsq_depth",
			help: "Depth of a channel in a specific nsq topic, topics are distinguished by the label 'topic', channels by the label 'channel'",
			labelNames: ["topic", "channel"],
		}),
	},
	loggers: {
		error: utils.createLogger("ERROR", console.error),
		ready: utils.createLogger("READY"),
		cleanup: utils.createLogger("CLEANUP"),
	},
	ephemeralRegex: config.get("ignoreEphemeral")
						? new RegExp("#ephemeral$")
						: null,
	nodeTTL: config.get("nodeTTL"),
	topicChannelTTl: config.get("topicChannelTTl"),
};

// create http listener to serve collected metrics to prometheus
http.createServer((_req, res) => {
	res.writeHead(200, {
		"Content-Type": "text/plain",
	});
	res.end(prometheus.register.metrics());
}).listen(config.get("port"));

// create nsq-watcher instance that will query the lookupd server and fire events with nsq stats
const watcher = new NsqWatch({
	lookupdHTTPAddresses: config.get("lookupdHTTPAddresses"),
	namespace: config.get("namespace"),
	statusPollInterval: config.get("nsqdPollInterval"),
	lookupdPollInterval: config.get("lookupdPollInterval"),
});

// set up cleanup worker
setInterval(() => {
	const now = Date.now();

	{
		// clean up old nodes
		const timedOutNodes = [];
		for (const nodeName of state.nodes.keys()) {
			const lastSeen = state.nodes.get(nodeName);
			// check if node timed out
			if (lastSeen < (now - (state.nodeTTL * 1000))) {
				timedOutNodes.push(nodeName);
			}
		}

		if (timedOutNodes.length) {
			state.loggers.cleanup("delete all timed out nodes", timedOutNodes);
		}

		// delete all timed out nodes
		for (const timedOutNode of timedOutNodes) {
			state.nodes.delete(timedOutNode);
		}

		// track new node count
		state.metrics.nsqdNodeGauge.set(state.nodes.size);
	}

	{
		// clean up old topic/channel-combos
		const timedOutCombos = [];
		for (const comboName of state.channels.keys()) {
			const lastSeen = state.channels.get(comboName);
			// check if combo timed out
			if (lastSeen < (now - (state.topicChannelTTl * 1000))) {
				timedOutCombos.push(comboName);
			}
		}

		if (timedOutCombos.length) {
			state.loggers.cleanup("delete all timed out channels", timedOutCombos);
		}

		// delete all timed out combos
		for (const timedOutCombo of timedOutCombos) {
			const [topic, channel] = timedOutCombo.split(" ");
			state.metrics.channelDepthGauge.remove(topic, channel);
			state.channels.delete(timedOutCombo);
		}
	}

	{
		// clean up old topics without a channel
		const timedOutTopics = [];
		for (const comboName of state.topics.keys()) {
			const lastSeen = state.topics.get(comboName);
			// check if topic timed out
			if (lastSeen < (now - (state.topicChannelTTl * 1000))) {
				timedOutTopics.push(comboName);
			}
		}

		if (timedOutTopics.length) {
			state.loggers.cleanup("delete all timed out channels", timedOutTopics);
		}

		// delete all timed out topics and their message counts
		// console.log("delete all timed out topics", timedOutTopics.length);
		for (const timedOutTopic of timedOutTopics) {
			const [topic, node] = timedOutTopic.split(" ");
			state.metrics.topicDepthGauge.remove(topic, node);
			state.metrics.topicMsgCountGauge.remove(topic, node);
			state.topics.delete(timedOutTopic);
		}
	}
}, 15 * 1000);

// log nsq-watcher's "ready" event
watcher.on("ready", state.loggers.ready);

// log and track nsq-watcher's "error" events
watcher.on("error", (...args) => {
	// log error
	state.loggers.error(...args);

	// track error count
	state.metrics.errorCounter.inc();
});

// track nsqd node count via nsq-watcher's "status" event
watcher.on("status", (_stats, node) => {
	// put node and current time into a map to ensure we always know when we have last seen a node
	state.nodes.set(`${node.broadcast_address}:${node.http_port}`, Date.now());

	// track node count
	state.metrics.nsqdNodeGauge.set(state.nodes.size);
});

// track message queue depth by nsq topic without channels via the nsq-watcher's "topic-depth" event
watcher.on("topic-depth", (topic, depth, meta, nodeData) => {
	// return early if ignoreEphemeral is enabled and topic name ends with "#ephemeral"
	if (state.ephemeralRegex && state.ephemeralRegex.test(topic)) {
		return;
	}

	const node = `${nodeData.broadcast_address}:${nodeData.http_port}`;

	// put topic and current time into a map to ensure we always know when we have last seen a topic
	state.topics.set(`${topic} ${node}`, Date.now());

	state.metrics.topicDepthGauge.set({
		topic,
		node,
	}, depth);

	state.metrics.topicMsgCountGauge.set({
		topic,
		node,
	}, meta.message_count)
});

// track message queue depth by nsq topic and channel via the nsq-watcher's "topic-channel-depth" event
watcher.on("topic-channel-depth", (topic, _depth, channelDepths) => {
	// return early if ignoreEphemeral is enabled and topic name ends with "#ephemeral"
	if (state.ephemeralRegex && state.ephemeralRegex.test(topic)) {
		return;
	}

	// track metrics for all channels in this topic
	for (const channel of Object.keys(channelDepths)) {
		// skip loop iteration if ignoreEphemeral is enabled and channel name ends with "#ephemeral"
		if (state.ephemeralRegex && state.ephemeralRegex.test(channel)) {
			continue;
		}

		// put topic, channel and current time into a map to ensure we always know when we have last seen a topic/channel combo
		state.channels.set(`${topic} ${channel}`, Date.now());

		state.metrics.channelDepthGauge.set({
			topic,
			channel,
		}, channelDepths[channel]);
	}
});

// trap sigint and exit process - this is needed to make ctrl+c work in docker
process.on("SIGINT", () => {
	const logger = utils.createLogger("PROCESS");
	logger("received SIGINT, stopping application");
	process.exit();
});