import React from 'react';

interface AppIconDarkProps {
  className?: string;
}

const AppIconDark: React.FC<AppIconDarkProps> = ({ className = '' }) => {
  return (
    <img 
      src="/assets/app-icon-dark.png" 
      alt="ScanItKnowIt App Icon" 
      width="48" 
      height="48" 
      className={`w-12 h-12 ${className}`}
    />
  );
};

export default AppIconDark;