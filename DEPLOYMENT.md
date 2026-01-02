# Deployment Guide

This guide covers deploying the University Portal Backend to various cloud platforms.

## Table of Contents
- [Prerequisites](#prerequisites)
- [MongoDB Atlas Setup](#mongodb-atlas-setup)
- [Redis Cloud Setup](#redis-cloud-setup)
- [Cloudinary Setup](#cloudinary-setup)
- [Gmail SMTP Setup](#gmail-smtp-setup)
- [Railway Deployment](#railway-deployment)
- [Render Deployment](#render-deployment)
- [Docker Deployment](#docker-deployment)
- [Environment Variables](#environment-variables)
- [Post-Deployment Checklist](#post-deployment-checklist)

## Prerequisites

- GitHub account with repository access
- MongoDB Atlas account (free tier available)
- Redis Cloud account (optional, free tier available)
- Cloudinary account (free tier available)
- Gmail account for SMTP

## MongoDB Atlas Setup

1. **Create Account**
   - Visit [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for a free account

2. **Create Cluster**
   - Click "Build a Database"
   - Select "Shared" (Free tier)
   - Choose your preferred region
   - Name your cluster

3. **Create Database User**
   - Go to "Database Access"
   - Add new database user
   - Choose password authentication
   - Save username and password

4. **Configure Network Access**
   - Go to "Network Access"
   - Click "Add IP Address"
   - Select "Allow Access from Anywhere" (0.0.0.0/0)

5. **Get Connection String**
   - Go to "Database" → "Connect"
   - Select "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Example: `mongodb+srv://username:password@cluster.mongodb.net/university_portal`

## Redis Cloud Setup (Optional)

1. **Create Account**
   - Visit [Redis Cloud](https://redis.com/try-free/)
   - Sign up for free account

2. **Create Database**
   - Create new subscription
   - Select free tier
   - Choose region
   - Create database

3. **Get Connection Details**
   - Copy the endpoint URL
   - Format: `redis://username:password@endpoint:port`

## Cloudinary Setup

1. **Create Account**
   - Visit [Cloudinary](https://cloudinary.com/)
   - Sign up for free account

2. **Get Credentials**
   - Go to Dashboard
   - Copy:
     - Cloud Name
     - API Key
     - API Secret

## Gmail SMTP Setup

> Note: If you switch to **Supabase Auth** for login/signup, email verification, and password resets,
> you can skip Gmail SMTP for those flows (Supabase sends the emails). You may still keep SMTP for
> other non-auth notifications.

1. **Enable 2-Factor Authentication**
   - Go to Google Account settings
   - Security → 2-Step Verification
   - Enable 2FA

2. **Create App Password**
   - Go to Security → App passwords
   - Select "Mail" and your device
   - Generate password
   - Copy the 16-character password

3. **SMTP Settings**
   - Host: `smtp.gmail.com`
   - Port: `587`
   - User: Your Gmail address
   - Password: App password (not your regular password)

## Railway Deployment

1. **Prerequisites**
   - Railway account
   - GitHub repository connected

2. **Deploy Steps**
   ```bash
   # Install Railway CLI (optional)
   npm install -g @railway/cli
   
   # Login
   railway login
   
   # Initialize project
   railway init
   
   # Link to existing project or create new
   railway link
   ```

3. **Configure Environment Variables**
   - Go to Railway dashboard
   - Select your project
   - Go to "Variables" tab
   - Add all environment variables from `.env.example`

   **If using Supabase Auth (recommended to avoid SMTP blocks on some hosts):**
   - Set `AUTH_STRATEGY=supabase`
   - Set `SUPABASE_URL=https://<your-project-ref>.supabase.co`
   - (Optional) `SUPABASE_JWT_AUDIENCE=authenticated`

4. **Deploy**
   ```bash
   railway up
   ```

5. **Custom Domain (Optional)**
   - Go to "Settings"
   - Add custom domain
   - Update DNS records

## Render Deployment

1. **Create Web Service**
   - Go to [Render Dashboard](https://dashboard.render.com/)
   - Click "New +" → "Web Service"
   - Connect GitHub repository

2. **Configure Service**
   - Name: `university-portal-backend`
   - Environment: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Instance Type: Free or paid

3. **Environment Variables**
   - Click "Environment"
   - Add all variables from `.env.example`
   - Example:
     ```
     NODE_ENV=production
     PORT=5000
     MONGODB_URI=<your-mongodb-atlas-uri>
     JWT_ACCESS_SECRET=<generate-random-secret>
     JWT_REFRESH_SECRET=<generate-random-secret>
     # ... add all other variables
     ```

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy

5. **Health Check**
   - Render automatically monitors `/health` endpoint
   - Configure custom health check if needed

## Docker Deployment

### Build and Run Locally

```bash
# Build image
docker build -t university-portal-backend .

# Run container
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGODB_URI=<your-uri> \
  -e JWT_ACCESS_SECRET=<secret> \
  university-portal-backend
```

### Using Docker Compose

```bash
# Development
docker-compose up -d

# Production (with custom compose file)
docker-compose -f docker-compose.prod.yml up -d
```

### Push to Docker Hub

```bash
# Tag image
docker tag university-portal-backend yourusername/university-portal-backend:latest

# Login
docker login

# Push
docker push yourusername/university-portal-backend:latest
```

## Environment Variables

### Required Variables

```env
NODE_ENV=production
PORT=5000
API_VERSION=v1
CLIENT_URL=https://your-frontend-url.com

# Database - MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/university_portal

# JWT Secrets - Generate strong random strings
JWT_ACCESS_SECRET=<your-super-secret-access-key-min-32-chars>
JWT_REFRESH_SECRET=<your-super-secret-refresh-key-min-32-chars>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email - Gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
EMAIL_FROM=University Portal <noreply@university.edu>

# Redis (optional)
REDIS_URL=redis://username:password@endpoint:port

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# 2FA
TWO_FACTOR_APP_NAME=University Portal
TWO_FACTOR_CODE_EXPIRY=300

# File Upload
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,doc,docx,jpg,jpeg,png

# Logging
LOG_LEVEL=info
LOG_DIR=logs

# CORS
CORS_ORIGIN=https://your-frontend-url.com

# Session
SESSION_SECRET=<your-session-secret-min-32-characters>
```

### Generate Secrets

```bash
# Generate random secrets (Node.js)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Or use OpenSSL
openssl rand -hex 32
```

## Post-Deployment Checklist

### 1. Verify Deployment
- [ ] Check health endpoint: `https://your-api.com/health`
- [ ] Verify API version: `https://your-api.com/api/v1`
- [ ] Test authentication endpoints

### 2. Database Setup
- [ ] Run database seeders (optional)
  ```bash
  npm run seed
  ```
- [ ] Verify database connections
- [ ] Check indexes are created

### 3. Test Core Features
- [ ] User registration
- [ ] User login
- [ ] Email verification (check spam folder)
- [ ] Password reset
- [ ] Course enrollment
- [ ] File uploads (if Cloudinary configured)

### 4. Monitor Logs
- [ ] Check application logs
- [ ] Monitor error logs
- [ ] Set up log aggregation (optional)

### 5. Security
- [ ] Verify HTTPS is enabled
- [ ] Test rate limiting
- [ ] Check CORS configuration
- [ ] Review security headers

### 6. Performance
- [ ] Test API response times
- [ ] Monitor database queries
- [ ] Check Redis cache (if configured)

### 7. Documentation
- [ ] Update API documentation URL
- [ ] Share Swagger docs: `https://your-api.com/docs`
- [ ] Document custom deployment configurations

## Monitoring and Maintenance

### Logging
- Application logs are stored in the `logs/` directory
- Use log aggregation services (Papertrail, LogDNA, etc.)

### Monitoring
- Set up uptime monitoring (UptimeRobot, Pingdom)
- Monitor database performance
- Track API response times

### Backups
- MongoDB Atlas provides automated backups
- Configure backup retention policies
- Test restore procedures

### Scaling
- **Horizontal Scaling**: Add more instances
- **Vertical Scaling**: Upgrade instance size
- **Database Scaling**: Upgrade MongoDB tier
- **Caching**: Enable Redis for better performance

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify MongoDB URI
- Check IP whitelist in MongoDB Atlas
- Ensure database user has correct permissions

**Email Not Sending**
- Verify Gmail app password (not regular password)
- Check email credentials
- Enable "Less secure app access" if needed

**CORS Errors**
- Update `CORS_ORIGIN` environment variable
- Verify frontend URL is correct

**File Upload Fails**
- Check Cloudinary credentials
- Verify file size limits
- Check file type restrictions

**High Memory Usage**
- Increase instance size
- Optimize database queries
- Enable Redis caching

## Support

For deployment issues:
1. Check application logs
2. Review environment variables
3. Consult platform-specific documentation
4. Open an issue on GitHub

---

**Ready for Production! 🚀**
