# University Portal Backend

A production-ready, enterprise-grade backend API for a comprehensive University Portal system built with Node.js, Express, TypeScript, and MongoDB.

## 🚀 Features

- **Security-First Architecture**: JWT authentication, 2FA support, rate limiting, input sanitization
- **Role-Based Access Control (RBAC)**: Student, Lecturer, Admin, HOD, and Bursary roles
- **Scalable Design**: Stateless API, Redis caching, horizontal scaling ready
- **Performance Optimized**: MongoDB indexing, query optimization, response compression
- **Real-time Features**: Socket.io for messaging and notifications (planned)
- **Background Jobs**: Bull queue for email sending and report generation (planned)
- **Comprehensive API**: 50+ endpoints for complete university management
- **Production Ready**: Docker support, graceful shutdown, health checks

## 📋 Prerequisites

- Node.js >= 18.0.0
- MongoDB >= 5.0
- Redis (optional, for caching)
- npm >= 9.0.0

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: Node.js 20 with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (Local) or Supabase Auth JWTs
- **File Storage**: Cloudinary
- **Email Service**: Nodemailer with Gmail SMTP (optional when using Supabase Auth)
- **2FA**: Speakeasy (TOTP) + Email OTP
- **Real-time**: Socket.io (planned)
- **Payment**: Mock/Test mode (Paystack-ready structure)
- **Caching**: Redis with memory fallback
- **Job Queue**: Bull (planned)
- **Validation**: Zod schemas
- **Logging**: Winston with file rotation
- **API Docs**: Swagger/OpenAPI
- **Testing**: Jest + Supertest

### Security Packages
- helmet - Secure HTTP headers
- express-rate-limit - Prevent brute force
- express-mongo-sanitize - Prevent NoSQL injection
- xss-clean - Prevent XSS attacks
- cors - Controlled CORS policy
- hpp - Prevent HTTP parameter pollution
- bcrypt - Password hashing

## 📦 Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd university-portal-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB**
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:7

# Or start your local MongoDB instance
```

5. **Start Redis (optional)**
```bash
# Using Docker
docker run -d -p 6379:6379 --name redis redis:alpine

# Or start your local Redis instance
```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Running with Docker
```bash
docker-compose up -d
```

## 📚 API Documentation

Once the server is running, access the Swagger documentation at:
- **Swagger UI**: http://localhost:5000/docs
- **Swagger JSON**: http://localhost:5000/docs.json

## 🔐 Environment Variables

See `.env.example` for all required environment variables:

```env
# Server
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# Auth (Supabase recommended)
# supabase: Supabase manages email verification + password reset; backend verifies Supabase JWTs
# local: legacy (Mongo) [deprecated]
AUTH_STRATEGY=supabase
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_JWT_AUDIENCE=authenticated
# SUPABASE_JWT_ISSUER=https://<your-project-ref>.supabase.co/auth/v1
# SUPABASE_JWKS_URL=https://<your-project-ref>.supabase.co/auth/v1/.well-known/jwks.json

# Database
# Using Supabase Postgres; no MongoDB URI required

# JWT
JWT_ACCESS_SECRET=your_super_secret_access_key
JWT_REFRESH_SECRET=your_super_secret_refresh_key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🏗️ Project Structure

```
university-portal-backend/
├── src/
│   ├── config/           # Configuration files (DB, Redis, JWT, etc.)
│   ├── models/           # Mongoose models
│   ├── controllers/      # Route controllers
│   ├── routes/           # API routes
│   │   └── v1/          # API version 1 routes
│   ├── middleware/       # Custom middleware
│   ├── services/         # Business logic services
│   ├── utils/            # Utility functions and helpers
│   ├── types/            # TypeScript type definitions
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── tests/               # Test files
├── logs/                # Application logs
├── docker/              # Docker configuration
├── .env.example         # Environment variables template
├── tsconfig.json        # TypeScript configuration
├── package.json         # Project dependencies
└── README.md           # This file
```

## 🔌 API Endpoints

### Authentication (`/api/v1/auth`)
- `POST /register` - Register new user
- `POST /login` - User login
- `POST /logout` - User logout
- `POST /refresh-token` - Refresh access token
- `POST /verify-email` - Verify email with token
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password
- `GET /me` - Get current user profile

### Courses (`/api/v1/courses`)
- `GET /` - List all courses (paginated, filterable)
- `GET /:id` - Get course details
- `POST /` - Create course (Admin only)
- `PUT /:id` - Update course (Admin/Lecturer)
- `DELETE /:id` - Delete course (Admin only)
- `POST /:id/enroll` - Enroll in course (Student)
- `DELETE /:id/unenroll` - Unenroll from course (Student)
- `GET /:id/students` - Get enrolled students (Lecturer/Admin)

### Health Check
- `GET /health` - Server health check
- `GET /api/v1` - API version information

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm test -- --coverage
```

## 🏗️ Database Models

The system includes comprehensive models for:
- **User Management**: Users with role-based access
- **Academic**: Courses, Enrollments, Assignments, Submissions
- **Results**: Student results with approval workflow
- **Payments**: Fee payments with verification
- **Notifications**: Real-time user notifications
- **And more**: Departments, Sessions, etc.

All models include:
- Proper indexing for performance
- Soft delete support
- Timestamp tracking
- Data validation

## 🔒 Security Features

- **Authentication**: JWT-based with access and refresh tokens
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Prevent brute force attacks
- **Input Validation**: Zod schemas for all endpoints
- **NoSQL Injection Prevention**: MongoDB sanitization
- **XSS Protection**: Input sanitization
- **CORS**: Controlled cross-origin requests
- **Helmet**: Secure HTTP headers
- **Password Security**: bcrypt with 12 salt rounds
- **Account Protection**: Lock after failed login attempts

## 📊 Performance Features

- **Database Indexing**: Optimized queries
- **Pagination**: All list endpoints support pagination
- **Response Compression**: Gzip compression
- **Lean Queries**: Optimized Mongoose queries
- **Connection Pooling**: MongoDB connection pool
- **Caching**: Redis support with fallback

## 🐳 Docker Support

Build and run with Docker:

```bash
# Build image
docker build -t university-portal-backend .

# Run with docker-compose
docker-compose up -d
```

## 📝 Logging

The application uses Winston for logging:
- **Console logs**: Development mode
- **File logs**: Production mode with rotation
- **Log levels**: error, warn, info, debug
- **Log files**: Located in `logs/` directory

## 🚀 Deployment

### Railway
1. Create a new project on Railway
2. Connect your GitHub repository
3. Add environment variables
4. Deploy automatically on push

### Render
1. Create a new Web Service
2. Connect your GitHub repository
3. Add environment variables
4. Deploy

See `DEPLOYMENT.md` (to be created) for detailed deployment instructions.

## 👥 User Roles

- **Student**: Enroll in courses, submit assignments, view results
- **Lecturer**: Manage courses, grade assignments, enter results
- **HOD**: Approve results, manage department
- **Admin**: Full system access, user management
- **Bursary**: Payment verification, fee management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Express.js team for the awesome framework
- Mongoose team for the elegant ODM
- All contributors to the open-source packages used

## 📞 Support

For support, email support@university.edu or open an issue in the repository.

---

**Built with ❤️ for educational excellence**