terraform {
  required_version = ">= 1.5.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0.0, < 8.0.0"
    }
  }
}

provider "oci" {}

resource "oci_core_instance" "accessflow" {
  availability_domain = var.availability_domain
  compartment_id      = var.compartment_ocid
  display_name        = var.display_name
  shape               = var.shape

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = var.subnet_ocid
    assign_public_ip = var.assign_public_ip
  }

  source_details {
    source_type             = "image"
    source_id               = var.image_ocid
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
  }
}

data "oci_core_vnic_attachments" "accessflow" {
  compartment_id = var.compartment_ocid
  instance_id    = oci_core_instance.accessflow.id
}

data "oci_core_vnic" "accessflow" {
  vnic_id = data.oci_core_vnic_attachments.accessflow.vnic_attachments[0].vnic_id
}
