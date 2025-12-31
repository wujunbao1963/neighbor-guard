#!/bin/sh
npx prisma generate
npx prisma db push
node src/index.js
