# SSH 키페어를 Terraform이 직접 만든다 (AWS 버전과 동일한 방식 - 개인키는 로컬 파일로만 남김)
resource "tls_private_key" "ssh" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "local_file" "private_key" {
  content         = tls_private_key.ssh.private_key_pem
  filename        = "${path.module}/generated_key.pem"
  file_permission = "0600"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# 무료 A1 인스턴스의 OS 이미지 - Ubuntu 22.04 ARM 버전 중 가장 최신
data "oci_core_images" "ubuntu" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "this" {
  compartment_id = var.tenancy_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "aiops-platform-vcn"
  dns_label      = "aiopsvcn"
}

resource "oci_core_internet_gateway" "this" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "aiops-platform-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "aiops-platform-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.this.id
  }
}

# 방화벽 규칙: 대시보드(30080)와 HTTP/HTTPS만 전 세계에 열고, SSH와 n8n 관리 포트는 관리자 IP로 제한
resource "oci_core_security_list" "this" {
  compartment_id = var.tenancy_ocid
  vcn_id         = oci_core_vcn.this.id
  display_name   = "aiops-platform-sl"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = var.allowed_ssh_cidr
    protocol = "6"
    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6"
    tcp_options {
      min = 30080
      max = 30080
    }
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6"
    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    source   = var.allowed_ssh_cidr
    protocol = "6"
    tcp_options {
      min = 30678
      max = 30678
    }
  }
}

resource "oci_core_subnet" "public" {
  compartment_id    = var.tenancy_ocid
  vcn_id            = oci_core_vcn.this.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "aiops-platform-public-subnet"
  dns_label         = "public"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.this.id]
}

resource "oci_core_instance" "this" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  compartment_id      = var.tenancy_ocid
  display_name        = "aiops-platform"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gb
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
    # 부트 볼륨은 무료 한도(총 200GB) 안에서 쓴다 - Docker 이미지 9개 + Postgres 데이터가 들어갈 만큼
    boot_volume_size_in_gbs = 80
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
  }

  metadata = {
    ssh_authorized_keys = tls_private_key.ssh.public_key_openssh
    # AWS 버전과 같은 부트스트랩 스크립트 재사용: Docker + k3s 설치, 저장소 clone, 이미지 빌드, k8s 적용
    user_data = base64encode(templatefile("${path.module}/../terraform/user_data.sh.tpl", {
      github_repo_url = var.github_repo_url
    }))
  }
}
