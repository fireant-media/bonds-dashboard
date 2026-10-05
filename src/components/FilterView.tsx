import { Enterprise, Bond } from '../types';
import { useLanguage } from '../LanguageContext';
import EnterpriseView from './EnterpriseView';
import MarketBondFilterView from './MarketBondFilterView';

interface FilterViewProps {
  activeSubTab: 'issuer' | 'bonds';
  selectedEnterprise: Enterprise | null;
  setSelectedEnterprise: (enterprise: Enterprise | null) => void;
  setSelectedBond: (bond: Bond | null) => void;
  setBondEnterpriseName: (name: string) => void;
}

export default function FilterView({
  activeSubTab,
  selectedEnterprise,
  setSelectedEnterprise,
  setSelectedBond,
  setBondEnterpriseName,
}: FilterViewProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      {activeSubTab === 'issuer' ? (
        <EnterpriseView
          selectedEnterprise={selectedEnterprise}
          setSelectedEnterprise={setSelectedEnterprise}
          setSelectedBond={setSelectedBond}
          setBondEnterpriseName={setBondEnterpriseName}
          listTitle={t('filterByIssuer')}
          breadcrumbTitle={t('filterByIssuer')}
        />
      ) : (
        <MarketBondFilterView
          setSelectedBond={setSelectedBond}
          setBondEnterpriseName={setBondEnterpriseName}
        />
      )}
    </div>
  );
}
