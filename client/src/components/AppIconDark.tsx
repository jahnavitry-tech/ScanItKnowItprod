import React from 'react';

interface AppIconDarkProps {
  className?: string;
}

const AppIconDark: React.FC<AppIconDarkProps> = ({ className = '' }) => {
  return (
    // Original: width="48" height="48" className={`w-12 h-12 ${className}`}
    // MODERN HEADER UPDATE - Design Request 001: Resizing to 32dp-40dp range for Material Design compliance
    <img 
      src="/assets/app-icon-dark.png" 
      alt="ScanItKnowIt App Icon" 
      width="40" 
      height="40" 
      className={`w-10 h-10 ${className}`}
    />
  );
};

export default AppIconDark;