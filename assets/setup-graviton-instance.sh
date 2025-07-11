#!/bin/bash
# Git
sudo yum install git -y
# Go
wget https://go.dev/dl/go1.24.5.linux-arm64.tar.gz
sudo tar -C /usr/local -xzf ./go1.24.5.linux-arm64.tar.gz
echo 'export PATH="$PATH:/usr/local/go/bin"' >> ~/.bashrc
source ~/.bashrc
sudo rm go1.24.5.linux-arm64.tar.gz
# perf
sudo yum install perf -y
# APerf
wget https://github.com/aws/aperf/releases/download/v0.1.15-alpha/aperf-v0.1.15-alpha-aarch64.tar.gz
sudo tar xf aperf-v0.1.15-alpha-aarch64.tar.gz
sudo rm aperf-v0.1.15-alpha-aarch64.tar.gz
# perl-open; see issue: https://github.com/brendangregg/FlameGraph/issues/245
sudo yum install perl-open.noarch -y
# Clone example Golang application
sudo git clone https://github.com/tchangkiat/go-gin