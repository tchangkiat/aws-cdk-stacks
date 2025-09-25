import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as eks from "aws-cdk-lib/aws-eks";
import { Stack, Tags } from "aws-cdk-lib";

export interface ManagedNodeGroupProps {
  cluster: eks.Cluster;
  nodeGroupName: string;
  instanceType?: string;
  amiType?: eks.NodegroupAmiType;
  capacityType?: eks.CapacityType;
  taints?: object[];
  tags?: Record<string, string>;
}

export class ManagedNodeGroup extends Construct {
  constructor(scope: Construct, id: string, props: ManagedNodeGroupProps) {
    super(scope, id);

    const cluster = props.cluster;
    const nodeGroupName = props.nodeGroupName;

    const eksNodeRole = new iam.Role(this, id + "-node-role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      roleName:
        cluster.clusterName + "-" + Stack.of(this).region + "-" + id + "-node",
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKS_CNI_Policy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSWorkerNodePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonEC2ContainerRegistryReadOnly",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMPatchAssociation"),
        // For X-Ray Daemon to send logs to X-Ray
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"),
        // For nodes to send logs and metrics to CloudWatch (Container Insights)
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "CloudWatchAgentServerPolicy",
        ),
        // For EBS CSI to provision EBS volumes
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          "ebs-csi-driver-policy",
          "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy",
        ),
      ],
    });

    const launchTemplate = new ec2.CfnLaunchTemplate(
      this,
      id + "-launch-template",
      {
        launchTemplateName: cluster.clusterName + "/" + nodeGroupName,
        launchTemplateData: {
          blockDeviceMappings: [
            {
              deviceName: "/dev/xvda",
              ebs: {
                deleteOnTermination: true,
                volumeType: "gp3",
              },
            },
            {
              deviceName: "/dev/xvdb",
              ebs: {
                deleteOnTermination: true,
                volumeType: "gp3",
              },
            },
          ],
          instanceType: props.instanceType ?? "c6g.xlarge",
          tagSpecifications: [
            {
              resourceType: "instance",
              tags: [
                {
                  key: "Name",
                  value: cluster.clusterName + "/" + nodeGroupName,
                },
                {
                  key: "eks-cost-cluster",
                  value: cluster.clusterName,
                },
                {
                  key: "eks-cost-workload",
                  value: "Proof-of-Concept",
                },
                {
                  key: "eks-cost-team",
                  value: "tck",
                },
              ],
            },
            {
              resourceType: "volume",
              tags: [
                {
                  key: "Name",
                  value: cluster.clusterName + "/" + nodeGroupName + "/volume",
                },
                {
                  key: "eks-cost-cluster",
                  value: cluster.clusterName,
                },
                {
                  key: "eks-cost-workload",
                  value: "Proof-of-Concept",
                },
                {
                  key: "eks-cost-team",
                  value: "tck",
                },
              ],
            },
          ],
        },
      },
    );

    return cluster.addNodegroupCapacity(id, {
      amiType: props.amiType ?? eks.NodegroupAmiType.BOTTLEROCKET_ARM_64,
      capacityType: props.capacityType ?? eks.CapacityType.ON_DEMAND,
      desiredSize: 1,
      minSize: 0,
      maxSize: 3,
      nodegroupName: nodeGroupName,
      nodeRole: eksNodeRole,
      launchTemplateSpec: {
        id: launchTemplate.ref,
        version: launchTemplate.attrLatestVersionNumber,
      },
      taints: props.taints ?? [],
      tags: props.tags ?? {},
    });
  }
}

export class ClusterAutoscaler extends Construct {
  constructor(scope: Construct, id: string, cluster: eks.Cluster) {
    super(scope, id);

    // Best practice: Cluster Autoscaler version must match the Kubernetes control plane version
    const eksClusterAutoscalerVersion = "v1.33.1";

    new eks.KubernetesManifest(this, "cluster-autoscaler", {
      cluster,
      manifest: [
        {
          apiVersion: "v1",
          kind: "ServiceAccount",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "ClusterRole",
          metadata: {
            name: "cluster-autoscaler",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          rules: [
            {
              apiGroups: [""],
              resources: ["events", "endpoints"],
              verbs: ["create", "patch"],
            },
            {
              apiGroups: [""],
              resources: ["pods/eviction"],
              verbs: ["create"],
            },
            {
              apiGroups: [""],
              resources: ["pods/status"],
              verbs: ["update"],
            },
            {
              apiGroups: [""],
              resources: ["endpoints"],
              resourceNames: ["cluster-autoscaler"],
              verbs: ["get", "update"],
            },
            {
              apiGroups: [""],
              resources: ["nodes"],
              verbs: ["watch", "list", "get", "update"],
            },
            {
              apiGroups: [""],
              resources: [
                "namespaces",
                "pods",
                "services",
                "replicationcontrollers",
                "persistentvolumeclaims",
                "persistentvolumes",
              ],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["extensions"],
              resources: ["replicasets", "daemonsets"],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["policy"],
              resources: ["poddisruptionbudgets"],
              verbs: ["watch", "list"],
            },
            {
              apiGroups: ["apps"],
              resources: ["statefulsets", "replicasets", "daemonsets"],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["storage.k8s.io"],
              resources: [
                "storageclasses",
                "csinodes",
                "csidrivers",
                "csistoragecapacities",
              ],
              verbs: ["watch", "list", "get"],
            },
            {
              apiGroups: ["batch", "extensions"],
              resources: ["jobs"],
              verbs: ["get", "list", "watch", "patch"],
            },
            {
              apiGroups: ["coordination.k8s.io"],
              resources: ["leases"],
              verbs: ["create"],
            },
            {
              apiGroups: ["coordination.k8s.io"],
              resourceNames: ["cluster-autoscaler"],
              resources: ["leases"],
              verbs: ["get", "update"],
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "Role",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          rules: [
            {
              apiGroups: [""],
              resources: ["configmaps"],
              verbs: ["create", "list", "watch"],
            },
            {
              apiGroups: [""],
              resources: ["configmaps"],
              resourceNames: [
                "cluster-autoscaler-status",
                "cluster-autoscaler-priority-expander",
              ],
              verbs: ["delete", "get", "update", "watch"],
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "ClusterRoleBinding",
          metadata: {
            name: "cluster-autoscaler",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: "cluster-autoscaler",
          },
          subjects: [
            {
              kind: "ServiceAccount",
              name: "cluster-autoscaler",
              namespace: "kube-system",
            },
          ],
        },
        {
          apiVersion: "rbac.authorization.k8s.io/v1",
          kind: "RoleBinding",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              "k8s-addon": "cluster-autoscaler.addons.k8s.io",
              "k8s-app": "cluster-autoscaler",
            },
          },
          roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: "cluster-autoscaler",
          },
          subjects: [
            {
              kind: "ServiceAccount",
              name: "cluster-autoscaler",
              namespace: "kube-system",
            },
          ],
        },
        {
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "cluster-autoscaler",
            namespace: "kube-system",
            labels: {
              app: "cluster-autoscaler",
            },
          },
          spec: {
            replicas: 1,
            selector: {
              matchLabels: {
                app: "cluster-autoscaler",
              },
            },
            template: {
              metadata: {
                labels: {
                  app: "cluster-autoscaler",
                },
                annotations: {
                  "prometheus.io/scrape": "true",
                  "prometheus.io/port": "8085",
                },
              },
              spec: {
                securityContext: {
                  runAsNonRoot: true,
                  runAsUser: 65534,
                  fsGroup: 65534,
                  seccompProfile: {
                    type: "RuntimeDefault",
                  },
                },
                serviceAccountName: "cluster-autoscaler",
                containers: [
                  {
                    image:
                      "registry.k8s.io/autoscaling/cluster-autoscaler:" +
                      eksClusterAutoscalerVersion,
                    name: "cluster-autoscaler",
                    resources: {
                      limits: {
                        cpu: "100m",
                        memory: "600Mi",
                      },
                      requests: {
                        cpu: "100m",
                        memory: "600Mi",
                      },
                    },
                    command: [
                      "./cluster-autoscaler",
                      "--v=4",
                      "--stderrthreshold=info",
                      "--cloud-provider=aws",
                      "--skip-nodes-with-local-storage=false",
                      "--expander=least-waste",
                      "--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/" +
                        cluster.clusterName,
                    ],
                    volumeMounts: [
                      {
                        name: "ssl-certs",
                        mountPath: "/etc/ssl/certs/ca-certificates.crt",
                        readOnly: true,
                      },
                    ],
                    imagePullPolicy: "Always",
                    securityContext: {
                      allowPrivilegeEscalation: false,
                      capabilities: {
                        drop: ["ALL"],
                      },
                      readOnlyRootFilesystem: true,
                    },
                  },
                ],
                tolerations: [
                  {
                    key: "CriticalAddonsOnly",
                    operator: "Exists",
                    effect: "NoSchedule",
                  },
                ],
                volumes: [
                  {
                    name: "ssl-certs",
                    hostPath: {
                      path: "/etc/ssl/certs/ca-bundle.crt",
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    });
  }

  tagNodeGroups(clusterName: string, nodeGroups: eks.Nodegroup[]): void {
    for (const ng of nodeGroups) {
      Tags.of(ng).add(`k8s.io/cluster-autoscaler/${clusterName}`, "owned", {
        applyToLaunchedInstances: true,
      });
      Tags.of(ng).add("k8s.io/cluster-autoscaler/enabled", "true", {
        applyToLaunchedInstances: true,
      });
    }
  }
}
