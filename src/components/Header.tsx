import { Search, Bell, LogOut, Settings, HelpCircle, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../LanguageContext';

interface HeaderProps {
  onProfileClick: () => void;
  onSettingsClick: () => void;
  onHelpClick: () => void;
  onLogoClick: () => void;
  onLogout: () => void;
  user: any;
}

export default function Header({ onProfileClick, onSettingsClick, onHelpClick, onLogoClick, onLogout, user }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { t } = useLanguage();

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name.charAt(0).toUpperCase();
  };

  return (
    <header className="h-16 bg-bg-surface border-b border-border-base flex items-center justify-between px-6 sticky top-0 z-50 transition-colors duration-300">
      <div className="flex items-center gap-4">
        <h1 
          className="text-xl font-bold text-text-highlight tracking-tight hover:cursor-pointer select-none transition-colors" 
          onClick={onLogoClick}
        >
          DASHBOARD
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-96 mr-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-border-base rounded-lg bg-bg-base text-sm text-text-base placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-text-highlight focus:border-transparent transition-all"
            placeholder={t('searchPlaceholder')}
          />
        </div>

        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="p-2 text-text-muted hover:bg-bg-base rounded-full relative transition-colors"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border-2 border-bg-surface"></span>
        </button>

        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 hover:bg-bg-base rounded-lg transition-colors"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-text-base leading-none">{user?.name || 'Admin User'}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-[#3634B3] flex items-center justify-center text-white font-bold overflow-hidden">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                getInitials(user?.name)
              )}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-bg-surface rounded-xl shadow-xl border border-border-base py-2 z-50">
              <button 
                onClick={() => {
                  onProfileClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <UserCircle className="h-4 w-4" /> {t('profile')}
              </button>
              <button 
                onClick={() => {
                  onSettingsClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <Settings className="h-4 w-4" /> {t('settings')}
              </button>
              <button 
                onClick={() => {
                  onHelpClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <HelpCircle className="h-4 w-4" /> {t('help')}
              </button>
              <hr className="my-1 border-border-base" />
              <button 
                onClick={() => {
                  onLogout();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
              >
                <LogOut className="h-4 w-4" /> {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}
