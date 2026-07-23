#!/bin/sh

node /directus/cli.js bootstrap
pm2-runtime start ecosystem.config.cjs
