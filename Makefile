SHELL:=/bin/bash

.PHONY: help publish update-vsce

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

publish: update-vsce ## Publish SafePKT VS Code plugin
	/bin/bash -c 'vsce package && vsce publish'

update-vsce: ## Upgrade vsce package
	npm i -g vsce

