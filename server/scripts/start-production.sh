#!/bin/sh
set -e

npx prisma migrate deploy
node dist/index.js
