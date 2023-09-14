#!/bin/bash

helm uninstall raycluster

helm uninstall kuberay-operator

helm repo remove kuberay