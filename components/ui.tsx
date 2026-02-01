
import React from 'react';

// --- VISUALS ---

export const Logo: React.FC<{ className?: string, onClick?: () => void }> = ({ className = '', onClick }) => (
  <div onClick={onClick} className={`flex items-center gap-2 cursor-pointer group ${className}`}>
    <div className="w-8 h-8 bg-slate-900 dark:bg-white rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 21H21" className="stroke-white dark:stroke-slate-900" strokeWidth="2" strokeLinecap="round"/>
        <path d="M3 16L9 10L13 14L21 6" className="stroke-white dark:stroke-slate-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 6V10" className="stroke-white dark:stroke-slate-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 6H17" className="stroke-white dark:stroke-slate-900" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <span className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">ClubInvest</span>
  </div>
);

export const Icon: React.FC<{ name: 'dashboard' | 'pie' | 'users' | 'book' | 'settings' | 'menu' | 'close' | 'arrowRight' | 'bank' | 'moon' | 'sun' | 'plus' | 'minus' | 'logout'; className?: string }> = ({ name, className = '' }) => {
    const icons = {
        dashboard: <path d="M3 3H10V10H3V3ZM14 3H21V10H14V3ZM3 14H10V21H3V14ZM14 14H21V21H14V14Z" />,
        pie: <path d="M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z" />,
        users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
        book: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />,
        settings: <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0 .73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />,
        menu: <path d="M3 12h18M3 6h18M3 18h18" />,
        close: <path d="M18 6L6 18M6 6l12 12" />,
        arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
        bank: <path d="M3 21h18M5 21v-7M19 21v-7M4 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm16 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8zM12 3L3 14h18L12 3z" />, // Simplified bank
        moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
        sun: <circle cx="12" cy="12" r="5" />,
        plus: <path d="M12 5v14M5 12h14" />,
        minus: <path d="M5 12h14" />,
        logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    };

    return (
        <svg 
            className={className} 
            width="24" height="24" viewBox="0 0 24 24" 
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
            {icons[name] || icons.dashboard}
        </svg>
    )
}

// --- LAYOUT COMPONENTS ---

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 p-8 transition-colors duration-300 ${className}`}>
    {children}
  </div>
);

export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline' | 'ghost';
  className?: string;
  disabled?: boolean;
}> = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const baseStyle = "px-6 py-3 rounded-full font-semibold tracking-wide transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-sm";
  const variants = {
    primary: "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 shadow-xl shadow-slate-900/10 hover:shadow-slate-900/20",
    secondary: "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700",
    danger: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-100 dark:border-red-900/50",
    success: "bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-900/20",
    outline: "border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-900 dark:hover:border-white hover:text-slate-900 dark:hover:text-white",
    ghost: "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-5 py-4 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-slate-900 dark:focus:ring-white outline-none transition-all font-medium ${props.className || ''}`}
  />
);

export const Badge: React.FC<{ children: React.ReactNode; type?: 'positive' | 'negative' | 'neutral' }> = ({ children, type = 'neutral' }) => {
  const styles = {
    positive: "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 border border-green-100 dark:border-green-900/50",
    negative: "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50",
    neutral: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
  };
  return (
    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${styles[type]}`}>
      {children}
    </span>
  );
};

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-md" onClick={onClose}></div>
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-md z-10 p-8 shadow-2xl animate-in fade-in zoom-in duration-300 border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto ring-1 ring-slate-900/5 dark:ring-white/10">
                <div className="flex justify-between items-center mb-8">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}

export const Table: React.FC<{ headers: string[]; children: React.ReactNode }> = ({ headers, children }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-sm">
      <thead className="">
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="px-6 py-4 font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[10px]">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
        {children}
      </tbody>
    </table>
  </div>
);

export const TableRow: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
  <tr 
    onClick={onClick}
    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </tr>
);

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-6 py-5 whitespace-nowrap text-slate-900 dark:text-slate-100 font-medium ${className}`}>
    {children}
  </td>
);
