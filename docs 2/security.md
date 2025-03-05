# Security Guidelines

This document outlines security best practices and implementation details for this application.

## API Key Security

### Client-Side

- API keys are stored in environment variables
- Never commit API keys to Git repositories
- API keys are validated before use
- In production, API keys are passed securely via headers rather than URL parameters

### Server-Side

- API keys are never logged or exposed in error messages
- Server validates API key format
- Proper authentication error handling without leaking information

## Rate Limiting

The application implements multi-layer rate limiting:

### Application Layer

- 60 requests per minute per client
- Proper 429 responses with Retry-After headers
- Rate limit counters reset automatically

### Nginx Layer

- Additional rate limiting at the Nginx level (20 requests per minute)
- Burst capabilities for legitimate traffic spikes
- IP-based rate limiting

## Data Protection

### User Data

- No personal information is stored persistently
- Chat sessions are confined to browser session only
- No tracking or analytics beyond basic health monitoring

### Travel Instructions Data

- All content is cached securely
- No sensitive information in cached data
- Data validation before caching

## Error Handling

- Sanitized error messages in production
- No stack traces or internal details in user-facing errors
- Structured error logging for debugging
- Appropriate HTTP status codes

## Network Security

### HTTPS

- All production traffic uses HTTPS
- SSL/TLS certificates via Let's Encrypt
- HTTP to HTTPS redirection
- Strict Transport Security (HSTS)

### CORS

- Properly configured CORS headers
- Secure default policy
- Explicit allowed origins

## Server Hardening

### Authentication

- Secure server access via SSH keys
- No password authentication
- Restricted sudo access

### Firewall

- Only necessary ports open (22, 80, 443)
- Drop all other incoming traffic
- Rate limiting at firewall level for SSH

### Updates

- Regular system updates
- Security patches applied promptly
- Dependency updates monitored

## Secure Coding Practices

### Input Validation

- All user inputs are validated
- Context-specific validation for different inputs
- Protection against injection attacks

### Dependencies

- Regular security audits of dependencies
- Minimal use of third-party libraries
- Pinned dependency versions

### API Security

- Secure default settings
- No sensitive information in URLs
- Authentication for all sensitive operations

## Monitoring and Logging

### Security Monitoring

- Failed authentication attempts tracked
- Rate limit breaches logged
- Unusual access patterns flagged

### Logging

- Sensitive data never logged
- Structured logging format
- Log rotation and retention policies

## Incident Response

In case of a security incident:

1. Immediately revoke compromised credentials
2. Analyze the scope and impact
3. Fix the vulnerability
4. Review and improve security measures

## Security Checklist for Development

When working on this application, always:

- [ ] Validate all user inputs
- [ ] Handle errors securely without leaking information
- [ ] Use environment variables for sensitive data
- [ ] Implement appropriate authentication for endpoints
- [ ] Test for common security vulnerabilities
- [ ] Keep dependencies updated
- [ ] Use secure coding practices