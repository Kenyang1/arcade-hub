FROM ubuntu:24.04

RUN apt-get update && \
    apt-get install -y wget ca-certificates && \
    wget https://fastdl.mongodb.org/tools/db/mongodb-database-tools-ubuntu2404-x86_64-100.20.1.deb \
      -O /tmp/mongodb-tools.deb && \
    apt-get install -y /tmp/mongodb-tools.deb && \
    rm -f /tmp/mongodb-tools.deb && \
    rm -rf /var/lib/apt/lists/*

CMD ["mongofiles", "--version"]