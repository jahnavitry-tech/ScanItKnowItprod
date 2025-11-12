import React from 'react';

interface CameraIconProps {
  theme: 'light' | 'dark';
  className?: string;
}

export const CameraIcon: React.FC<CameraIconProps> = ({ theme, className = '' }) => {
  if (theme === 'light') {
    return (
      <svg 
        viewBox="0 0 24 24" 
        className={className}
        data-testid="camera-icon-svg"
      >
        <path d="M20.304 6.261h-3.26l-.435-1.305a1.304 1.304 0 0 0-1.246-.87H8.609c-.507 0-.97.272-1.246.724l-.417 1.456-3.297.018a1.304 1.304 0 0 0-1.304 1.305v10.434a1.304 1.304 0 0 0 1.304 1.305h15.217a1.304 1.304 0 0 0 1.305-1.305V7.566a1.304 1.304 0 0 0-1.305-1.305zM8.739 11.348a2.609 2.609 0 1 1 5.218 0 2.609 2.609 0 0 1-5.218 0z"/>
      </svg>
    );
  } else {
    return (
      <svg 
        viewBox="0 0 24 24" 
        className={className}
        data-testid="camera-icon-svg"
      >
        <path d="M20.304 6.261h-3.26l-.435-1.305a1.304 1.304 0 0 0-1.246-.87H8.609c-.507 0-.97.272-1.246.724l-.417 1.456-3.297.018a1.304 1.304 0 0 0-1.304 1.305v10.434a1.304 1.304 0 0 0 1.304 1.305h15.217a1.304 1.304 0 0 0 1.305-1.305V7.566a1.304 1.304 0 0 0-1.305-1.305zM8.739 11.348a2.609 2.609 0 1 1 5.218 0 2.609 2.609 0 0 1-5.218 0z"/>
      </svg>
    );
  }
};