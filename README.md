# PlanPM - Preventive Maintenance Management System

A modern, cloud-based preventive maintenance management system for labs and manufacturing facilities.

## 🚀 Features

- ✅ **Instrument Management** - Track all your equipment in one place
- ✅ **Smart Scheduling** - Daily, Weekly, Monthly, 3/6 Months, Yearly schedules
- ✅ **Virtual Schedules** - Automatically generates future maintenance dates
- ✅ **Document Management** - Upload certificates, reports, and photos
- ✅ **Excel-Like Filters** - Filter by any column with familiar UI
- ✅ **Template System** - Create calibration/testing templates
- ✅ **Mobile Responsive** - Works on desktop, tablet, and mobile
- ✅ **Google OAuth** - Secure sign-in with Google accounts
- ✅ **Real-time Updates** - Instant sync across devices

## 🏗️ Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript
- **UI:** Tailwind CSS, shadcn/ui components
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **Hosting:** Vercel
- **Authentication:** Google OAuth via Supabase

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account
- Google Cloud Console project

## 🛠️ Local Development

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/planpm.git
cd planpm
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:9002](http://localhost:9002) in your browser.

## 🚀 Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for complete deployment instructions.

Quick steps:
1. Push to GitHub
2. Connect to Vercel
3. Add environment variables
4. Deploy!

Use [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) to track your progress.

## 📱 Usage

### For Users

1. **Sign In** - Use your Google account
2. **Add Instruments** - Add your equipment with details
3. **Create Schedules** - Set up maintenance schedules
4. **Update Results** - Record maintenance activities
5. **Upload Documents** - Attach certificates and reports
6. **Track Progress** - View dashboard and charts

### For Administrators

- All users can manage their own instruments
- RLS (Row Level Security) ensures data isolation
- Each user only sees their own data

## 🗄️ Database Schema

### Main Tables

- `instruments` - Equipment/instrument records
- `maintenance_configurations` - Schedule configurations
- `maintenanceSchedules` - Individual maintenance events
- `maintenanceResults` - Completed maintenance records
- `maintenance_documents` - Document metadata
- `test_templates` - Calibration/testing templates

## 🔐 Security

- ✅ Google OAuth authentication
- ✅ Row Level Security (RLS) on all tables
- ✅ Environment variables for secrets
- ✅ HTTPS enforced (Vercel)
- ✅ Supabase secure storage for documents

## 🐛 Troubleshooting

### OAuth Issues

If Google login fails:
1. Check authorized redirect URIs in Google Console
2. Verify Supabase site URL matches your domain
3. Check environment variables are set correctly

### Database Issues

If data doesn't load:
1. Check Supabase RLS policies
2. Verify user is authenticated
3. Check browser console for errors

### Build Issues

If build fails:
1. Run `npm run build` locally
2. Fix TypeScript errors
3. Check all dependencies are installed

## 📊 Project Structure

```
planpm/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   │   ├── dashboard/    # Dashboard components
│   │   ├── instruments/  # Instrument management
│   │   ├── maintenance/  # Maintenance components
│   │   └── ui/           # shadcn/ui components
│   ├── contexts/         # React contexts (auth, etc.)
│   ├── lib/              # Utilities and helpers
│   └── hooks/            # Custom React hooks
├── public/               # Static assets
├── DEPLOYMENT_GUIDE.md   # Deployment instructions
└── DEPLOYMENT_CHECKLIST.md # Deployment checklist
```

## 🤝 Contributing

This is currently an MVP. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

[MIT License](LICENSE) - feel free to use for your own projects

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Database and auth by [Supabase](https://supabase.com/)
- Hosted on [Vercel](https://vercel.com/)

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check the deployment guides
- Review Vercel and Supabase logs

## 🎯 Roadmap

**Current MVP Features (Done):**
- ✅ Core instrument management
- ✅ Flexible scheduling system
- ✅ Document upload and management
- ✅ Dashboard with charts
- ✅ Excel-like filtering

**Future Enhancements (After Beta Testing):**
- Email notifications for due maintenance
- Mobile app (React Native)
- Multi-user teams
- Payment integration
- Advanced reporting
- API for integrations
- Barcode/QR code scanning

---

**Version:** 1.0.0 MVP
**Last Updated:** December 2024

Made with ❤️ for maintenance teams everywhere
