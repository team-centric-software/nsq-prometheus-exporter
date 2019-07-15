VERSION := $(shell jq -r '.version' package.json)
REGISTRY := $(shell jq -r '.registry' deploy.json)
REPO := $(shell jq -r '.repo' deploy.json)

.PHONY: all
all: | build push

.PHONY: build
build:
	docker build . \
		--force-rm \
		-t $(REPO):latest \
		-t $(REPO):$(VERSION) \
		-t $(REGISTRY)/$(REPO):latest \
		-t $(REGISTRY)/$(REPO):$(VERSION)

.PHONY: push
push:
	docker push $(REGISTRY)/$(REPO):$(VERSION)
	docker push $(REGISTRY)/$(REPO):latest
