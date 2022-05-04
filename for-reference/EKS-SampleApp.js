const { Stack } = require("aws-cdk-lib");
const iam = require("aws-cdk-lib/aws-iam");
const eks = require("aws-cdk-lib/aws-eks");

class EKSSampleApp extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // EKS
    // ----------------------------

    const handlerRole = iam.Role.fromRoleArn(this, 'HandlerRole', 'arn');
    const kubectlProvider = eks.KubectlProvider.fromKubectlProviderAttributes(this, 'KubectlProvider', {
      functionArn: 'arn',
      kubectlRoleArn: 'arn',
      handlerRole,
    });

    const cluster = eks.Cluster.fromClusterAttributes(this, "eks-cluster", {
      clusterName: "Demo",
      kubectlProvider,
    });

    // ----------------------------
    // EKS > Sample Deployment
    // ----------------------------

    new eks.KubernetesManifest(this, "sample-express-api-manifest", {
      cluster,
      manifest: [
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "sample-express-api",
            labels: { app: "sample-express-api" },
          },
          spec: {
            replicas: 2,
            selector: {
              matchLabels: {
                app: "sample-express-api",
              },
            },
            template: {
              metadata: {
                labels: {
                  app: "sample-express-api",
                },
              },
              spec: {
                serviceAccountName: "sample-express-api-service-account",
                containers: [
                  {
                    name: "sample-express-api",
                    image: "[URL]",
                    ports: [{ containerPort: 8000 }],
                    resources: {
                      limits: {
                        cpu: "0.4",
                        memory: "200Mi",
                      },
                      requests: {
                        cpu: "0.2",
                        memory: "100Mi",
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        {
          apiVersion: "v1",
          kind: "Service",
          metadata: {
            name: "sample-express-api-service",
          },
          spec: {
            type: "LoadBalancer",
            selector: {
              app: "sample-express-api",
            },
            ports: [
              { name: "http", protocol: "TCP", port: 80, targetPort: 8000 },
            ],
          },
        },
        {
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
          metadata: {
            name: "sample-express-api-ingress",
            annotations: {
              "nginx.ingress.kubernetes.io/rewrite-target": "/",
            },
          },
          spec: {
            ingressClassName: "sample-express-api",
            rules: [
              {
                http: {
                  paths: [
                    {
                      path: "/",
                      pathType: "Prefix",
                      backend: {
                        service: {
                          name: "sample-express-api-service",
                          port: {
                            number: 80,
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
      ingressAlb: true,
      ingressAlbScheme: eks.AlbScheme.INTERNET_FACING,
      overwrite: true,
    });
  }
}

module.exports = { EKSSampleApp };
