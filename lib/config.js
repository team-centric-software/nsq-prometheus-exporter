const convict = require("convict");

// define custom config value formats
convict.addFormat({
	// values from arg or env look like this: "lookup-one:4161,lookup-two:4161"
	// values from file looks like this: ["lookup-one:4161", "lookup-two:4161"]
	name: "comma-separated-server-list",
	coerce: (val) => val.split(","),
	validate: (val) => {
		if (!Array.isArray(val) || val.length < 1) {
			throw new Error("must be a comma separated list of hostname:port combinations with at least one element");
		}

		if (!val.every(item => item.split(":").length === 2)) {
			throw new Error("must be a comma separated list of hostname:port combinations");
		}
	},
});
convict.addFormat({
	// either a string or null/undefined
	name: "optional-string",
	validate: (val) => val == null || typeof val === "string",
});

// define our configuration schema
const config = convict({
	port: {
		doc: "port to serve prometheus metrics",
		format: "port",
		env: "PORT",
		arg: "port",
		default: 3000,
	},

	lookupdHTTPAddresses: {
		doc: "list of lookupd http addresses (without protocol), envvars and args have to be defined as comma separated list. eg: 'lookupa:1234,lookupb:5674'",
		format: "comma-separated-server-list",
		env: "LOOKUPD_HTTP_ADDRESSES",
		arg: "lookupd-http-addresses",
		default: null,
	},

	namespace: {
		doc: "list only stats for topics that are prefixed with this string, this prefix gets stripped of all topic names in the metrics",
		format: "optional-string",
		env: "TOPIC_NAMESPACE",
		arg: "topic-namespace",
		default: null,
	},

	nsqdPollInterval: {
		doc: "time to wait between nsqd status refreshes (this is where the topic/channel depths come from)",
		format: "nat",
		env: "NSQD_POLL_INTERVAL",
		arg: "nsqd-poll-interval",
		default: 30,
	},

	lookupdPollInterval: {
		doc: "time to wait between lookupd status refreshes (this is where we get the nsqd nodes from)",
		format: "nat",
		env: "LOOKUPD_POLL_INTERVAL",
		arg: "lookupd-poll-interval",
		default: 30,
	},

	ignoreEphemeral: {
		doc: "ignore topics and channels that end with #ephemeral (nsq does not buffer those to disk)",
		format: Boolean,
		env: "IGNORE_EPHEMERAL",
		arg: "ignore-ephemeral",
		default: true,
	},

	nodeTTL: {
		doc: "how many seconds do we assume a node is alive without hearing from it?",
		format: "nat",
		env: "NODE_TTL",
		arg: "node-ttl",
		default: 60,
	},

	topicChannelTTl: {
		doc: "how many seconds do we assume a channel for a topic (or a topic without a channel) is alive without hearing from it?",
		format: "nat",
		env: "TOPIC_CHANNEL_TTL",
		arg: "topic-channel-ttl",
		default: 120,
	},
})

// perform validation
config.validate({
	allowed: "strict"
});

// export configuration
module.exports = config;