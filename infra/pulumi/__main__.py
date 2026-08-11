"""
envelopes — envelopes.lukeroh.de
S3 + CloudFront SPA, shares the lukeroh.de ingress stack (Route53 zone + OIDC + IAM roles).
"""

import pulumi
from pulumi_static_site import StaticSite

config = pulumi.Config()
domain = config.get("domain") or "envelopes.lukeroh.de"

ingress = pulumi.StackReference("lukerohde/lukerohde-ingress/prod")
zone_id = ingress.get_output("zone_id")

site = StaticSite(
    "envelopes",
    domain=domain,
    zone_id=zone_id,
    bucket_name="lukerohde-envelopes",
    spa_mode=True,
)

pulumi.export("bucket", site.bucket_name)
pulumi.export("distribution_id", site.distribution_id)
pulumi.export("cloudfront_domain", site.distribution_domain.apply(lambda d: f"https://{d}"))
pulumi.export("aws_region", pulumi.Config("aws").require("region"))
