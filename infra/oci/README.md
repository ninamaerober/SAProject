# Provision an OCI Compute instance

This Terraform configuration creates one OCI Compute instance in an existing compartment and subnet. It does not create networking rules or deploy the app. OCI authentication is read from the OCI CLI configuration on your computer; no credentials belong in this directory.

## Prerequisites

- Terraform 1.5 or later.
- OCI CLI configured for your account (for example, with `oci setup config`) and permission to create Compute instances in the target compartment.
- An existing subnet and a Linux image OCID compatible with the selected region and Compute shape.
- An SSH key pair. Only the public key is passed to Terraform.

Check OCI pricing and Always Free eligibility for your tenancy, region, shape, and boot volume before applying. The default shape is `VM.Standard.A1.Flex`, but availability and pricing vary.

## Create the instance

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and replace every placeholder. Find the compartment, subnet, availability domain, and compatible Linux image OCIDs in the OCI Console.
2. Initialize and inspect the proposed resources:
   ```bash
   terraform init
   terraform plan
   ```
3. If the plan is correct and you accept any charges, create the instance:
   ```bash
   terraform apply
   ```
4. Read the instance's `public_ip` output. Terraform provisions the VM only; follow the OCI deployment steps in the repository's main README to install the container runtime and deploy the app.

The subnet's existing security list or network security group must allow SSH (TCP 22) only from your trusted IP. For initial app testing, allow TCP 8080 only from trusted addresses; use HTTPS through an OCI Load Balancer or another TLS-terminating proxy for production. This configuration does not open any network ports.

Terraform state can contain infrastructure identifiers. Keep the state and `terraform.tfvars` private; both are excluded from Git. To delete the instance, run `terraform destroy` from this directory and review the plan before confirming.
