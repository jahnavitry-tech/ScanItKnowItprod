# Scan It Know It

## Overview

Scan It Know It is a full-stack web application that allows users to take photos of products and get comprehensive AI-powered analysis. The app provides detailed information about ingredients, nutritional content, community reviews, and includes an interactive Q&A feature. Users can capture images using their device camera or upload from their photo gallery, then receive intelligent analysis through multiple specialized AI agents.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

**Frontend Architecture**
- Built with React 18 and TypeScript for type safety
- Uses Vite as the build tool and development server
- Wouter for lightweight client-side routing
- State management handled through React hooks and TanStack Query for server state
- Responsive design with Tailwind CSS and shadcn/ui component library
- Theme system supporting light/dark mode with persistent storage
- Camera integration using native browser MediaDevices API

**Backend Architecture**
- Node.js Express server with TypeScript
- RESTful API design with structured error handling
- Middleware for logging, JSON parsing, and file uploads
- In-memory storage implementation with interface for future database integration
- Drizzle ORM configured for PostgreSQL (prepared for future database implementation)
- Modular service layer for external API integrations

**Component Design Pattern**
- Modular component architecture with clear separation of concerns
- Custom hooks for reusable logic (camera, theme, mobile detection)
- UI components following atomic design principles
- Card-based expandable interface with exclusive open behavior
- Real-time chat interface for Q&A functionality

**State Management Strategy**
- Local component state for UI interactions
- TanStack Query for server state, caching, and data fetching
- Context providers for global state (theme)
- Form state managed through React Hook Form with Zod validation

**Data Flow Architecture**
- Image upload triggers initial AI processing
- On-demand data fetching for analysis cards
- Cached responses to prevent redundant API calls
- Progressive disclosure pattern for complex data

## External Dependencies

**AI Services**
- OpenAI GPT-5 for product identification, text extraction, and specialized analysis
- Multiple AI agents for different analysis types (ingredients, nutrition, chat responses)
- Structured JSON responses for consistent data handling

**Database**
- Drizzle ORM configured for PostgreSQL
- Neon Database serverless driver for cloud database connectivity
- Schema definitions for users, product analyses, and chat messages
- Currently using in-memory storage with database interface ready for production

**UI Framework**
- Radix UI primitives for accessible component foundations
- Tailwind CSS for utility-first styling
- Lucide React for consistent iconography
- Custom CSS variables for theme system implementation

**Development Tools**
- ESBuild for production server bundling
- PostCSS for CSS processing and autoprefixing
- TypeScript for static type checking
- Replit integration for development environment

**File Upload & Processing**
- Multer middleware for multipart form handling
- Base64 image encoding for AI service integration
- 10MB file size limit for image uploads

**Reddit Integration**
- Reddit JSON API for community review data
- Custom sentiment analysis for pros/cons extraction
- Rate limiting considerations for API calls

**Session Management**
- Connect-pg-simple for PostgreSQL session storage
- Express session middleware for user state persistence