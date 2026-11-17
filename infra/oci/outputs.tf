output "instance_id" {
  description = "OCID of the created Compute instance."
  value       = oci_core_instance.accessflow.id
}

output "private_ip" {
  description = "Private IP address of the instance."
  value       = data.oci_core_vnic.accessflow.private_ip_address
}

output "public_ip" {
  description = "Public IP address, if one was assigned."
  value       = data.oci_core_vnic.accessflow.public_ip_address
}
