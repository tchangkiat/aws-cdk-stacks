## AWS X-Ray

> Prerequisite 1: Deploy the Multi-Architecture Pipeline. To use your own container image from a registry, replace \<URL\> and execute `export CONTAINER_IMAGE_URL=<URL>`.

> Prerequisite 2: Install [AWS Load Balancer Controller](#add-ons).

> Prerequisite 3: Install [Deploy Application](#deploy-application).

### Setup

1. Set up AWS X-Ray DaemonSet.

```bash
./eks-add-ons.sh -i xray
```

2. Changed the "AWS_XRAY_SDK_DISABLED" environment variables from "TRUE" to "FALSE" (case sensitive) for 2 "web-app" containers in [web-app.yaml](./assets/web-app.yaml).

```bash
- name: AWS_XRAY_SDK_DISABLED
  value: "FALSE"
```

3. Uncomment the following lines in [web-app.yaml](./assets/web-app.yaml).

```bash
- name: AWS_XRAY_DAEMON_ADDRESS
  value: "xray-daemon.kube-system.svc.cluster.local:2100"
- name: AWS_XRAY_APP_NAME
  value: "web-app-amd64"
...
- name: AWS_XRAY_DAEMON_ADDRESS
  value: "xray-daemon.kube-system.svc.cluster.local:2100"
- name: AWS_XRAY_APP_NAME
  value: "web-app-arm64"
```

4. Re-deploy the application

```bash
kubectl apply -f web-app.yaml
```

### Clean Up

1. Remove the application.

```bash
kubectl delete -f web-app.yaml
```

2. Remove AWS X-Ray DaemonSet.

```bash
./eks-add-ons.sh -r xray
```
