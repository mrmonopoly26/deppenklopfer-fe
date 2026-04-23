.PHONY: install dev build preview

install:
	npm install

dev: install
	npm run dev

build: install
	npm run build

preview: build
	npm run preview
