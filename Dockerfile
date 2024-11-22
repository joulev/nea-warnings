FROM oven/bun:1.1.34
WORKDIR /usr/src/app
COPY . /usr/src/app
RUN bun install
CMD bun start
