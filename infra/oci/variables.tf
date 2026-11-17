variable "compartment_ocid" {
  description = "OCID of the compartment where the instance will be created."
  type        = string
}

variable "availability_domain" {
  description = "Availability domain in the selected region."
  type        = string
}

variable "subnet_ocid" {
  description = "OCID of an existing subnet. Use a public subnet to assign a public IP."
  type        = string
}

variable "image_ocid" {
  description = "OCID of a Linux image compatible with the selected shape and region."
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key to authorize for the default Linux user."
  type        = string
}

variable "display_name" {
  description = "Name assigned to the Compute instance."
  type        = string
  default     = "accessflow-server"
}

variable "shape" {
  description = "Flexible OCI Compute shape for the instance."
  type        = string
  default     = "VM.Standard.A1.Flex"

  validation {
    condition     = can(regex("\\.Flex$", var.shape))
    error_message = "This configuration requires a flexible OCI Compute shape."
  }
}

variable "ocpus" {
  description = "Number of OCPUs assigned to the instance."
  type        = number
  default     = 1

  validation {
    condition     = var.ocpus > 0
    error_message = "ocpus must be greater than zero."
  }
}

variable "memory_in_gbs" {
  description = "Memory in GB assigned to the instance."
  type        = number
  default     = 6

  validation {
    condition     = var.memory_in_gbs > 0
    error_message = "memory_in_gbs must be greater than zero."
  }
}

variable "boot_volume_size_in_gbs" {
  description = "Boot volume size in GB."
  type        = number
  default     = 50

  validation {
    condition     = var.boot_volume_size_in_gbs >= 50
    error_message = "boot_volume_size_in_gbs must be at least 50 GB."
  }
}

variable "assign_public_ip" {
  description = "Assign a public IP to the instance's primary VNIC."
  type        = bool
  default     = true
}
