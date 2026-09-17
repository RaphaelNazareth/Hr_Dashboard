# playco - Modern Intranet Dashboard

A comprehensive, modern intranet dashboard built with React, TypeScript, and Tailwind CSS. playco  provides a centralized hub for team collaboration, employee engagement, and organizational information.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-blue.svg)](https://tailwindcss.com/)

## 🚀 Live Demo

This project is configured for deployment on **Vercel**. 

## ✨ Features

### 🏠 **Dashboard Hub**
- **Responsive Design**: Fully responsive across mobile, tablet, and desktop
- **Dark/Light Mode**: Complete theming system with user preference persistence
- **Focus Mode**: Distraction-free mode for improved productivity
- **Drag & Drop**: Customizable card layout with persistent preferences

### 👥 **Employee Engagement**
- **Kudos & Shout-Outs**: Peer recognition system with real-time feed
- **Employee Directory**: Searchable directory with department filtering
- **Organization Chart**: Interactive hierarchical organization structure
- **Profile Management**: User profiles with avatar and preferences

### 📅 **Team Collaboration**
- **Team Calendar**: Event management with birthdays, anniversaries, and meetings
- **Company Announcements**: Priority-based announcement system
- **Quick Links**: Customizable bookmarks with drag-and-drop reordering
- **For You Feed**: Personalized content and updates

### 🔍 **Search & Navigation**
- **Global Search**: Cmd/Ctrl+K shortcut for quick access
- **Advanced Filtering**: Multi-criteria filtering across all modules
- **Smart Navigation**: Breadcrumb navigation and quick actions

### 🎨 **User Experience**
- **Welcome Checklist**: Interactive onboarding for new users
- **Accessible Design**: WCAG compliant with keyboard navigation
- **Loading States**: Smooth transitions and loading indicators
- **Mobile-First**: Optimized for touch interfaces

## 🛠 Tech Stack

### **Frontend**
- **React 19** - Latest React with concurrent features
- **TypeScript** - Type-safe development
- **Vite** - Lightning-fast build tool and dev server
- **React Router DOM** - Client-side routing

### **Styling & UI**
- **Tailwind CSS v4** - Utility-first CSS with latest features
- **Radix UI** - Accessible, unstyled UI primitives
- **shadcn/ui** - Beautiful, reusable UI components
- **Lucide React** - Beautiful, customizable icons

### **State Management**
- **React Context API** - Global state management
- **localStorage** - Persistent user preferences
- **Custom Hooks** - Reusable stateful logic

### **Additional Libraries**
- **react-organizational-chart** - Interactive org chart visualization
- **Sonner** - Toast notifications
- **class-variance-authority** - Component variant management

## 📁 Project Structure

```
playco /
├── src/
│   ├── components/           # Reusable UI components
│   │   ├── ui/              # shadcn/ui base components
│   │   ├── CompanyAnnouncements.tsx
│   │   ├── EmployeeDirectory.tsx
│   │   ├── Header.tsx
│   │   ├── KudosFeed.tsx
│   │   ├── OrganizationChart.tsx
│   │   ├── QuickLinks.tsx
│   │   ├── TeamCalendar.tsx
│   │   └── ...
│   ├── pages/               # Page components
│   │   ├── Dashboard.tsx
│   │   ├── CalendarPage.tsx
│   │   ├── EmployeeDirectoryPage.tsx
│   │   └── ...
│   ├── contexts/            # React contexts
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utility functions
│   ├── types/               # TypeScript type definitions
│   └── data/                # Mock data and constants
├── public/                  # Static assets
└── dist/                    # Build output
```

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ 
- **npm** 9+ or **yarn** 1.22+

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/praveen-sripati/playco .git
   cd playco 
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
# Build the project
npm run build

# Preview the build
npm run preview
```

## 🌐 Deployment

### Vercel (Recommended)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   ```

The project includes a `vercel.json` configuration file for optimal deployment.

### Other Platforms

The build output in `/dist` can be deployed to any static hosting service:
- **Netlify**: Drag and drop the `dist` folder
- **GitHub Pages**: Use GitHub Actions with the build
- **AWS S3**: Upload the `dist` folder contents

## 📱 Features Breakdown

### Dashboard Components

| Component | Description | Features |
|-----------|-------------|----------|
| **For You Feed** | Personalized content | • Document updates<br>• Task notifications<br>• News items |
| **Company Announcements** | Official communications | • Priority levels<br>• Search & filter<br>• Rich content |
| **Employee Directory** | Team member lookup | • Department filtering<br>• Contact information<br>• Search functionality |
| **Kudos Feed** | Peer recognition | • Give/receive kudos<br>• Real-time updates<br>• Social interaction |
| **Team Calendar** | Event management | • Birthdays & anniversaries<br>• Company events<br>• Visual indicators |
| **Quick Links** | Bookmark management | • Drag & drop sorting<br>• Add/remove links<br>• Quick access |

### User Experience Features

- **🎯 Focus Mode**: Hide distractions for deep work
- **🌙 Dark Mode**: Eye-friendly dark theme
- **📱 Mobile Responsive**: Optimized for all screen sizes
- **⌨️ Keyboard Shortcuts**: Quick navigation (Cmd+K)
- **🔄 Drag & Drop**: Customizable layout
- **💾 Persistence**: Saves user preferences locally

## 🎨 Customization

### Theming

The project uses Tailwind CSS v4 with a custom theme configuration. Modify colors and styling in:

```css
/* src/index.css */
@theme {
  --color-primary: /* your primary color */;
  --color-secondary: /* your secondary color */;
}
```

### Adding Components

1. Create component in `src/components/`
2. Add types to `src/types/`
3. Update routing in `src/App.tsx`
4. Add to dashboard in `src/pages/Dashboard.tsx`

## 🧪 Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Code Style

- **ESLint**: Configured for React and TypeScript
- **Prettier**: Automatic code formatting
- **TypeScript**: Strict type checking enabled

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Radix UI** for accessible component primitives
- **shadcn/ui** for the beautiful component library
- **Tailwind CSS** for the utility-first styling approach
- **Lucide** for the comprehensive icon library

---


