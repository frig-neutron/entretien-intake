.PHONY: deploy

init:
	yarn install
	npx clasp login

deploy:
	ENV=$(env) ./deploy/deploy.sh
