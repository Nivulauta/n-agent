# AWS WAF Configuration Guide

## Overview

This guide explains the AWS WAF configuration for the REST API Gateway module, including how to customize rules, monitor traffic, and troubleshoot issues.

## WAF Architecture

```
Internet Traffic
    ↓
AWS WAF (Regional)
    ├─ IP Blocklist Rule (Priority 0) - Optional
    ├─ Rate Limit Rule (Priority 1) - 2000 req/5min per IP
    ├─ Common Rule Set (Priority 2) - OWASP Top 10
    ├─ Known Bad Inputs (Priority 3) - Malicious patterns
    └─ SQL Injection Rules (Priority 4) - SQL attack prevention
    ↓
API Gateway
    ↓
Lambda Functions
```

## Default Configuration

### Rate-Based Rule
- **Limit**: 2000 requests per 5 minutes per IP address
- **Action**: Block
- **Aggregate**: By source IP
- **Auto-unblock**: After 5 minutes

### AWS Managed Rules

1. **AWSManagedRulesCommonRuleSet**
   - Protects against OWASP Top 10
   - Some rules in COUNT mode to reduce false positives
   
2. **AWSManagedRulesKnownBadInputsRuleSet**
   - Blocks known malicious patterns
   - Malformed request detection

3. **AWSManagedRulesSQLiRuleSet**
   - SQL injection protection
   - Database attack prevention

## Customization

### Adjusting Rate Limit

To change the rate limit (default: 2000 requests per 5 minutes):

```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  waf_rate_limit = 5000  # Allow 5000 requests per 5 minutes per IP
}
```

### IP Blocklist

Block specific IP addresses or CIDR ranges:

```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  waf_ip_blocklist = [
    "192.0.2.44/32",      # Single IP
    "198.51.100.0/24",    # CIDR range
    "203.0.113.0/24"      # Another range
  ]
}
```

### IP Allowlist

Allow only specific IP addresses (optional):

```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  waf_ip_allowlist = [
    "192.0.2.0/24",       # Corporate network
    "198.51.100.0/24"     # VPN range
  ]
}
```

**Note**: Allowlist is created but not enforced by default. To enforce, you need to add a custom rule.

### Disabling WAF

For development environments only:

```hcl
module "rest_api" {
  source = "./modules/rest-api"
  
  # ... other variables ...
  
  enable_waf = false
}
```

**Warning**: Not recommended for production environments.

## Monitoring

### CloudWatch Metrics

WAF emits metrics to CloudWatch:

- `AllowedRequests` - Requests that passed all rules
- `BlockedRequests` - Requests blocked by any rule
- `CountedRequests` - Requests matched by COUNT rules
- `{RuleName}` - Metrics for each individual rule

### CloudWatch Logs

WAF logs are stored at:
```
/aws/wafv2/{environment}-chatbot-api
```

Log format:
```json
{
  "timestamp": 1234567890,
  "formatVersion": 1,
  "webaclId": "arn:aws:wafv2:...",
  "terminatingRuleId": "RateLimitRule",
  "terminatingRuleType": "RATE_BASED",
  "action": "BLOCK",
  "httpRequest": {
    "clientIp": "192.0.2.1",
    "country": "US",
    "uri": "/auth/login",
    "method": "POST"
  },
  "rateBasedRuleList": [...],
  "nonTerminatingMatchingRules": [...]
}
```

**Note**: Authorization and Cookie headers are redacted for security.

### Sampled Requests

WAF samples requests for analysis:
- View in AWS Console → WAF → Web ACLs → Sampled requests
- Shows last 3 hours of traffic
- Includes blocked and allowed requests
- Useful for debugging false positives

## Troubleshooting

### Legitimate Traffic Blocked

**Symptoms**: Users report 403 Forbidden errors

**Diagnosis**:
1. Check CloudWatch WAF logs: `/aws/wafv2/{environment}-chatbot-api`
2. Look for `action: "BLOCK"` entries
3. Identify the `terminatingRuleId`

**Solutions**:

#### Rate Limit Too Low
```hcl
waf_rate_limit = 5000  # Increase limit
```

#### False Positive from Managed Rules
Add rule override to set to COUNT mode:
```hcl
# In main.tf, add to the rule:
rule_action_override {
  name = "RuleName"
  action_to_use {
    count {}
  }
}
```

#### IP Incorrectly Blocked
Remove from blocklist or add to allowlist.

### High WAF Costs

**Symptoms**: Unexpected AWS WAF charges

**Diagnosis**:
- Check number of requests in CloudWatch metrics
- Review Web ACL capacity units (WCU)

**Solutions**:
1. Reduce rate limit to block more traffic earlier
2. Add IP blocklist for known bad actors
3. Disable unused managed rule sets
4. Consider disabling WAF in dev environments

### Rate Limit Not Working

**Symptoms**: Abuse continues despite rate limiting

**Diagnosis**:
1. Check if requests come from multiple IPs (distributed attack)
2. Verify rate limit is configured correctly
3. Check if requests are below the threshold

**Solutions**:
1. Lower the rate limit threshold
2. Add IP blocklist for known attackers
3. Enable additional managed rule sets
4. Consider API Gateway throttling (50 req/sec)

### False Negatives (Attacks Not Blocked)

**Symptoms**: Malicious traffic getting through

**Diagnosis**:
1. Review CloudWatch logs for attack patterns
2. Check which rules are in COUNT mode
3. Verify managed rule sets are enabled

**Solutions**:
1. Enable additional managed rule sets
2. Change COUNT rules to BLOCK
3. Add custom rules for specific attack patterns
4. Lower rate limit threshold

## Best Practices

### Production Environments
- ✅ Enable WAF (`enable_waf = true`)
- ✅ Use default rate limit (2000 req/5min) or lower
- ✅ Enable all managed rule sets
- ✅ Monitor CloudWatch metrics daily
- ✅ Review sampled requests weekly
- ✅ Set up CloudWatch alarms for blocked requests

### Development Environments
- ⚠️ Consider disabling WAF to reduce costs
- ⚠️ If enabled, use higher rate limits
- ⚠️ Set some rules to COUNT mode for testing

### Staging Environments
- ✅ Enable WAF to match production
- ✅ Use same configuration as production
- ✅ Test rate limits and rules before production deployment

## Cost Estimation

AWS WAF pricing (as of 2024):
- Web ACL: $5.00/month
- Rules: $1.00/month per rule (5 rules = $5.00)
- Requests: $0.60 per 1 million requests

Example monthly cost for 10 million requests:
- Web ACL: $5.00
- Rules: $5.00 (5 rules)
- Requests: $6.00 (10M requests)
- **Total**: ~$16.00/month

**Note**: Managed rule sets are included in the rule cost.

## Security Considerations

### What WAF Protects Against
- ✅ DDoS attacks (rate limiting)
- ✅ SQL injection
- ✅ Cross-site scripting (XSS)
- ✅ Known malicious patterns
- ✅ OWASP Top 10 vulnerabilities
- ✅ IP-based attacks (blocklist)

### What WAF Does NOT Protect Against
- ❌ Application logic vulnerabilities
- ❌ Authentication bypass (use Lambda Authorizer)
- ❌ Business logic abuse
- ❌ Credential stuffing (use rate limiting + MFA)
- ❌ Zero-day exploits (until rules updated)

### Defense in Depth

WAF is one layer in a multi-layered security approach:

1. **WAF** - Network/application layer protection
2. **API Gateway Throttling** - Request rate limiting
3. **Lambda Authorizer** - Authentication/authorization
4. **Request Validation** - Input validation
5. **IAM Roles** - Least privilege access
6. **Encryption** - Data protection (TLS, KMS)
7. **Audit Logging** - Compliance and forensics

## Additional Resources

- [AWS WAF Documentation](https://docs.aws.amazon.com/waf/)
- [AWS Managed Rules](https://docs.aws.amazon.com/waf/latest/developerguide/aws-managed-rule-groups.html)
- [WAF Best Practices](https://docs.aws.amazon.com/waf/latest/developerguide/waf-chapter.html)
- [CloudWatch Metrics for WAF](https://docs.aws.amazon.com/waf/latest/developerguide/monitoring-cloudwatch.html)

## Support

For issues or questions:
1. Check CloudWatch logs and metrics
2. Review sampled requests in AWS Console
3. Consult this guide and AWS documentation
4. Contact AWS Support for complex issues
