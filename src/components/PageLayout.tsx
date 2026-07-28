import { type FC, type ReactNode } from 'react';

interface PageLayoutProps {
  children: ReactNode;
  className?: string;
}

export const PageLayout: FC<PageLayoutProps> = ({ children, className = '' }) => {
  return (
    <div className={`flex-1 p-8 ${className}`}>
      {children}
    </div>
  );
};