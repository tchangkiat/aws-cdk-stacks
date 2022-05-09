const { Stack, CfnOutput, CfnJson, Tag, Tags } = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const eks = require("aws-cdk-lib/aws-eks");
const iam = require("aws-cdk-lib/aws-iam");

class EksLbCtrl extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // ----------------------------
    // Configuration
    // ----------------------------

    const eksClusterName = "Demo";
    const openIdConnectProviderArn =
      "arn:aws:iam::" +
      props.env.account +
      ":oidc-provider/oidc.eks.ap-southeast-1.amazonaws.com/id/7E1E470E12F86624BADD480B6D53D436";
    const kubectlRoleArn =
      "arn:aws:iam::" +
      props.env.account +
      ":role/eks-cluster-clusterMastersRoleEABFBB9C-XQM5VR5UEJCJ";

    // ----------------------------
    // EKS
    // ----------------------------

    const cluster = eks.Cluster.fromClusterAttributes(this, "cluster", {
      clusterName: eksClusterName,
      openIdConnectProvider:
        iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
          this,
          "oidc-provider",
          openIdConnectProviderArn
        ),
      kubectlRoleArn: kubectlRoleArn,
    });

    // -----------------------------------
    // EKS > AWS Load Balancer Controller
    // -----------------------------------

    const oidcUrl = openIdConnectProviderArn.replace(
      "arn:aws:iam::" + props.env.account + ":oidc-provider/",
      ""
    );
    const conditionKey1 = oidcUrl + ":sub";
    const conditionKey2 = oidcUrl + ":aud";
    const conditionJson = {
      StringEquals: {},
    };
    conditionJson["StringEquals"][conditionKey1] =
      "system:serviceaccount:kube-system:aws-load-balancer-controller";
    conditionJson["StringEquals"][conditionKey2] = "sts.amazonaws.com";

    const awsLoadBalancerControllerRole = new iam.Role(
      this,
      "aws-load-balancer-controller-role",
      {
        /*assumedBy: new iam.FederatedPrincipal(
          openIdConnectProviderArn,
          {
            StringEquals: {
              conditionKey1:
                "system:serviceaccount:kube-system:aws-load-balancer-controller",
              conditionKey2: "sts.amazonaws.com",
            },
          },
          "sts:AssumeRoleWithWebIdentity"
        ),*/
        assumedBy: new iam.FederatedPrincipal(
          openIdConnectProviderArn,
          {},
          "sts:AssumeRoleWithWebIdentity"
        ),
        roleName: "eks-" + eksClusterName + "-load-balancer-controller",
      }
    );

    const awsLoadBalancerControllerPolicy = new iam.Policy(
      this,
      "aws-load-balancer-controller-policy",
      {
        roles: [awsLoadBalancerControllerRole],
        policyName: "eks-" + eksClusterName + "-load-balancer-controller",
        document: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["iam:CreateServiceLinkedRole"],
              resources: ["*"],
              conditions: {
                StringEquals: {
                  "iam:AWSServiceName": "elasticloadbalancing.amazonaws.com",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "ec2:DescribeAccountAttributes",
                "ec2:DescribeAddresses",
                "ec2:DescribeAvailabilityZones",
                "ec2:DescribeInternetGateways",
                "ec2:DescribeVpcs",
                "ec2:DescribeVpcPeeringConnections",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeInstances",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DescribeTags",
                "ec2:GetCoipPoolUsage",
                "ec2:DescribeCoipPools",
                "elasticloadbalancing:DescribeLoadBalancers",
                "elasticloadbalancing:DescribeLoadBalancerAttributes",
                "elasticloadbalancing:DescribeListeners",
                "elasticloadbalancing:DescribeListenerCertificates",
                "elasticloadbalancing:DescribeSSLPolicies",
                "elasticloadbalancing:DescribeRules",
                "elasticloadbalancing:DescribeTargetGroups",
                "elasticloadbalancing:DescribeTargetGroupAttributes",
                "elasticloadbalancing:DescribeTargetHealth",
                "elasticloadbalancing:DescribeTags",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: [
                "cognito-idp:DescribeUserPoolClient",
                "acm:ListCertificates",
                "acm:DescribeCertificate",
                "iam:ListServerCertificates",
                "iam:GetServerCertificate",
                "waf-regional:GetWebACL",
                "waf-regional:GetWebACLForResource",
                "waf-regional:AssociateWebACL",
                "waf-regional:DisassociateWebACL",
                "wafv2:GetWebACL",
                "wafv2:GetWebACLForResource",
                "wafv2:AssociateWebACL",
                "wafv2:DisassociateWebACL",
                "shield:GetSubscriptionState",
                "shield:DescribeProtection",
                "shield:CreateProtection",
                "shield:DeleteProtection",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["ec2:CreateSecurityGroup"],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["ec2:CreateTags"],
              resources: ["arn:aws:ec2:*:*:security-group/*"],
              conditions: {
                StringEquals: {
                  "ec2:CreateAction": "CreateSecurityGroup",
                },
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: ["ec2:CreateTags", "ec2:DeleteTags"],
              resources: ["arn:aws:ec2:*:*:security-group/*"],
              conditions: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:DeleteSecurityGroup",
              ],
              resources: ["*"],
              conditions: {
                Null: {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:CreateLoadBalancer",
                "elasticloadbalancing:CreateTargetGroup",
              ],
              resources: ["*"],
              conditions: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:CreateListener",
                "elasticloadbalancing:DeleteListener",
                "elasticloadbalancing:CreateRule",
                "elasticloadbalancing:DeleteRule",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
              ],
              resources: [
                "arn:aws:elasticloadbalancing:*:*:targetgroup/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/net/*/*",
                "arn:aws:elasticloadbalancing:*:*:loadbalancer/app/*/*",
              ],
              conditions: {
                Null: {
                  "aws:RequestTag/elbv2.k8s.aws/cluster": "true",
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:AddTags",
                "elasticloadbalancing:RemoveTags",
              ],
              resources: [
                "arn:aws:elasticloadbalancing:*:*:listener/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener/app/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/net/*/*/*",
                "arn:aws:elasticloadbalancing:*:*:listener-rule/app/*/*/*",
              ],
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:ModifyLoadBalancerAttributes",
                "elasticloadbalancing:SetIpAddressType",
                "elasticloadbalancing:SetSecurityGroups",
                "elasticloadbalancing:SetSubnets",
                "elasticloadbalancing:DeleteLoadBalancer",
                "elasticloadbalancing:ModifyTargetGroup",
                "elasticloadbalancing:ModifyTargetGroupAttributes",
                "elasticloadbalancing:DeleteTargetGroup",
              ],
              resources: ["*"],
              conditions: {
                Null: {
                  "aws:ResourceTag/elbv2.k8s.aws/cluster": "false",
                },
              },
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:RegisterTargets",
                "elasticloadbalancing:DeregisterTargets",
              ],
              resources: ["arn:aws:elasticloadbalancing:*:*:targetgroup/*/*"],
            }),
            new iam.PolicyStatement({
              actions: [
                "elasticloadbalancing:SetWebAcl",
                "elasticloadbalancing:ModifyListener",
                "elasticloadbalancing:AddListenerCertificates",
                "elasticloadbalancing:RemoveListenerCertificates",
                "elasticloadbalancing:ModifyRule",
              ],
              resources: ["*"],
            }),
          ],
        }),
      }
    );

    cluster.addServiceAccount("aws-load-balancer-controller-service-account", {
      annotations: {
        "eks.amazonaws.com/role-arn": awsLoadBalancerControllerRole.roleArn,
      },
      name: "aws-load-balancer-controller",
      namespace: "kube-system",
    });
  }
}

module.exports = { EksLbCtrl };
