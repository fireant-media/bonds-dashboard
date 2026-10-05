import { useLanguage } from '../LanguageContext';

export default function SentinelFooter() {
  const { t } = useLanguage();
  return (
    <div className="mt-12 pt-12 border-t border-border-base transition-colors">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-12">
        <div className="col-span-2">
          <h4 className="text-sm font-bold text-[#3634B3] uppercase tracking-wider mb-4 transition-colors">FIREANT</h4>
          <p className="text-sm text-text-muted leading-relaxed whitespace-pre-line transition-colors">
            {t('platformDesc1')}{"\n"}
            {t('platformDesc2')}{"\n"}
            {t('platformDesc3')}
          </p>
        </div>
        <div>
          <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4 transition-colors">{t('support')}</h4>
          <ul className="text-sm text-text-muted space-y-2">
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('helpCenter')}</li>
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('systemStatus')}</li>
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('apiDocs')}</li>
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-4 transition-colors">{t('compliance')}</h4>
          <ul className="text-sm text-text-muted space-y-2">
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('privacyPolicy')}</li>
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('dataSecurity')}</li>
            <li className="hover:text-[#3634B3] cursor-pointer transition-colors">{t('termsOfService')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}