# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in AI Advantage Sports, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Email security concerns directly to: **ian@allowayllc.com**
3. Include the following in your report:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Response Time**: You will receive an acknowledgment within 48 hours
- **Updates**: We will provide status updates every 5 business days
- **Resolution**: Critical vulnerabilities will be addressed within 7 days
- **Credit**: Security researchers will be credited in release notes (unless anonymity is requested)

## Security Considerations for Sports Betting Apps

### Financial Data Security

This application handles betting-related financial data. Security considerations include:

- **Payment Processing**: All payment data is handled by Stripe (PCI compliant)
- **User Credentials**: Never store passwords in plain text
- **Betting Data**: User betting history should be encrypted
- **API Keys**: Never expose API keys in client-side code

### Secure Deployment Checklist

- [ ] Use HTTPS for all connections
- [ ] Store API keys in environment variables
- [ ] Enable rate limiting on API endpoints
- [ ] Implement proper CORS policies
- [ ] Use secure session management
- [ ] Validate all user inputs
- [ ] Sanitize data before display (XSS prevention)
- [ ] Keep dependencies updated

### Known Security Considerations

1. **Odds API Keys**: The Odds API key should be server-side only. Never expose in client bundles.

2. **Stripe Integration**: Use Stripe's recommended security practices. Never log full card numbers.

3. **User Data**: Betting preferences and history are sensitive. Handle according to privacy regulations.

4. **ML Model Integrity**: Ensure prediction models aren't tampered with.

## Responsible Gambling

While not a security issue per se, responsible gambling features should be implemented:

- Deposit limits
- Self-exclusion options
- Session time reminders
- Links to gambling addiction resources

## Responsible Disclosure

We follow responsible disclosure practices:

1. Reporter notifies us of vulnerability
2. We acknowledge and begin investigation
3. We develop and test a fix
4. We release the fix and notify users
5. After 90 days (or upon fix release), details may be published

## Contact

- Security Email: ian@allowayllc.com
- General Contact: [@ianallowayxyz](https://x.com/ianallowayxyz)
