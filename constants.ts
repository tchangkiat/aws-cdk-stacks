export class Autoscaler {
  static readonly Karpenter = "kpt";
  static readonly ClusterAutoscaler = "ca";
}

export class EC2InstanceAccess {
  static readonly InstanceConnect = "instanceconnect";
  static readonly SSH = "ssh";
  static readonly Private = "private";
}

export class EC2InstanceOS {
  static readonly AmazonLinux2023 = "al2023";
  static readonly Ubuntu = "ubuntu";
}
