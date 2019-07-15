# nsq-prometheus-exporter

Given a list of nsqlookupd http endpoint, this service periodically scrapes all discovered nsqd nodes and exports topic/channel metrics for prometheus.

Uses [nsq-watch](https://www.npmjs.com/package/nsq-watch) internally!


### Metrics

Only 3 metrics get exported:

name | type |description
--- | --- | ---
`nsq_nsqd_node_count` | gauge | how many nsqd instances were discovered from lookupd queries?
`nsq_watcher_error_count` | counter | how many error events have been fired from [nsq-watch](https://www.npmjs.com/package/nsq-watch)?
`nsq_depth{topic="$TOPIC",channel="$CHANNEL"` | gauge | message queue depth per topic and channel


### Configuration

Have a look into the config schema at [lib/config.js](lib/config.js) to find details and default values for each config key (don't be afraid, it's not much!).  
To run with the default configuration just give nsq-prometheus-exporter a list of lookupd http endpoints: `LOOKUPD_HTTP_ADDRESSES=lookupd-one:4161,lookupd-two:4161 node .`  
It can also contain only a single item: `LOOKUPD_HTTP_ADDRESSES=the-only-lookupd:4161 node .`  
[Ephemeral topics](https://nsq.io/overview/internals.html#backend--diskqueue) and channels will be ignored by default. Change this by setting `IGNORE_EPHEMERAL=false`.


### Docker

* edit `deploy.json` and fill in the correct values
* to build the container: `make build`
* to push the container: `make push`
* to run the container:
	```
	docker run -d \
		-p 3000:3000 \
		--restart always \
		-e LOOKUPD_HTTP_ADDRESSES=the-only-lookupd:4161 \
		--name nsq-prometheus-exporter \
		nsq-prometheus-exporter:latest
	```
* to build and push at the same time: `make`