# Application Load Balancer (ALB) Rule Restriction

![Application Load Balancer (ALB) Rule Restriction Architecture](./diagrams/alb-rule-restriction.jpg)

## Setup

```bash
cdk deploy alb-rule-restriction
```

## Testing the ALB rules

1. Connect to Bastion Host and run the following command. You should receive a response from Nginx.

```bash
curl <ALB DNS Name>:80
```

2. Run the following command. You should receive a response from the ALB: "Denied by ALB".

```bash
curl <ALB DNS Name>:8080
```

## Clean Up

```bash
cdk destroy alb-rule-restriction
```