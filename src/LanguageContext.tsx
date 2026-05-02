
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from './translations';
import { getCache } from './utils/cache';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: any, ticker?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('sentinel_language');
    return (saved as Language) || 'vi';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('sentinel_language', lang);
  };

  const t = (key: any, ticker?: string): string => {
    // Check cache for international name if in English mode
    if (language === 'en' && ticker) {
      const enNames = getCache('enterprise_names_en');
      if (enNames && enNames[ticker]) {
        return enNames[ticker];
      }
    }

    // 0. Static maps for translations
    const tickerMap: Record<string, string> = {
      'ACB': 'entACB',
      'TCB': 'entTechcombank',
      'VHM': 'entVinhomes',
      'VJC': 'entVietjet',
      'MBB': 'entMBBank',
      'VPB': 'entVPBank',
      'TPB': 'entTPBank',
      'HDB': 'entHDBank',
      'MSB': 'entMSB',
      'OCB': 'entOCB',
      'STB': 'entSacombank',
      'CTG': 'entVietinBank',
      'VCB': 'entVietcombank',
      'BID': 'entBidv',
      'BSR': 'entBSR',
      'VND': 'entVndirect',
      'SSI': 'entSSI',
      'GAS': 'entPVGas',
      'HPG': 'entHoaPhat',
      'FPT': 'entFPT',
      'VNM': 'entVinamilk',
      'VIC': 'entVingroup',
      'VRE': 'entVincomRetail',
      'PLX': 'entPetrolimex',
      'POW': 'entPVPower',
      'NVL': 'entNovaland',
      'VIB': 'entVIB',
      'SHB': 'entSHB',
      'EIB': 'entEximbank',
      'LPB': 'entLPBank',
      'HAG': 'entHAGL',
      'DGC': 'entDucGiang',
      'GVR': 'entGVR',
      'MWG': 'entMWG',
      'VDS': 'entVDS',
      'TMS': 'entTMS',
      'TNG': 'entTNG',
    };

    const industryMap: Record<string, keyof typeof translations.vi> = {
      'Tài chính': 'financialsIndustry',
      'Ngân hàng': 'bankingIndustry',
      'Chứng khoán': 'securitiesIndustry',
      'Bất động sản': 'realEstateIndustry',
      'Thực phẩm & Đồ uống': 'foodBeverageIndustry',
      'Thực phẩm và đồ uống': 'foodBeverageIndustry',
      'Tài nguyên cơ bản': 'basicResourcesIndustry',
      'Xây dựng & Vật liệu': 'constructionMaterialsIndustry',
      'Xây dựng và vật liệu': 'constructionMaterialsIndustry',
      'Dịch vụ tài chính': 'financialServicesIndustry',
      'Bán lẻ': 'retailIndustry',
      'Dầu khí': 'oilGasIndustry',
      'Tiện ích': 'utilitiesIndustry',
      'Hàng & Dịch vụ công nghiệp': 'industrialGoodsServicesIndustry',
      'Hàng và dịch vụ công nghiệp': 'industrialGoodsServicesIndustry',
      'Các sản phẩm và dịch vụ công nghiệp': 'industrialGoodsServicesIndustry',
      'Viễn thông': 'telecommunicationsIndustry',
      'Hàng tiêu dùng không thiết yếu': 'consumerDiscretionaryIndustry',
      'Hàng tiêu dùng cơ bản': 'consumerStaplesIndustry',
      'Công nghiệp': 'industrialsIndustry',
      'Vật liệu cơ bản': 'basicMaterialsIndustry',
      'Công nghệ': 'technologyIndustry',
      'Các dịch vụ hạ tầng': 'infrastructureServicesIndustry',
      'Năng lượng': 'energyIndustry',
      'Hàng cá nhân & Gia đình': 'personalHouseholdGoodsIndustry',
      'Hàng cá nhân và gia đình': 'personalHouseholdGoodsIndustry',
      'Hàng tiêu dùng cá nhân và gia đình': 'personalHouseholdGoodsIndustry',
      'Hàng tiêu dùng cá nhân và Gia đình': 'personalHouseholdGoodsIndustry',
      'Dược phẩm & Y tế': 'healthcareIndustry',
      'Dược phẩm và y tế': 'healthcareIndustry',
      'Du lịch & Giải trí': 'travelLeisureIndustry',
      'Du lịch và giải trí': 'travelLeisureIndustry',
      'Tourism và giải trí': 'travelLeisureIndustry',
      'Tourism và Giải trí': 'travelLeisureIndustry',
      'Phương tiện truyền thông': 'mediaIndustry',
      'Hóa chất': 'chemicalsIndustry',
      'Ô tô & Phụ tùng': 'automobilesPartsIndustry',
      'Ô tô và phụ tùng': 'automobilesPartsIndustry',
      'Bảo hiểm': 'insuranceIndustry',
      'Các sản phẩm và dịch vụ Industry': 'industrialGoodsServicesIndustry',
    };

    const enterpriseMap: Record<string, keyof typeof translations.vi> = {
      'ABBANK': 'entABBank',
      'ACB': 'entACB',
      'Agribank': 'entAgribank',
      'An Gia Investment': 'entAnGia',
      'Bamboo Capital': 'entBambooCapital',
      'BCG': 'entBambooCapital',
      'BCG Land': 'entBCGLand',
      'BacABank': 'entBacABank',
      'Bao Viet Group': 'entBaoViet',
      'Becamex IDC': 'entBecamexIDC',
      'Becamex IJC': 'entBecamexIJC',
      'BIDV': 'entBidv',
      'Bình Sơn': 'entBSR',
      'BSR': 'entBSR',
      'BVBank': 'entBVBank',
      'CEO Group': 'entCEOGroup',
      'CII': 'entCII',
      'CTR': 'entViettelConstruction',
      'CTCP Vinhomes': 'entVinhomes',
      'CTCP Aviation VIETJET': 'entVietjet',
      'Joint Stock Commercial Bank Tiên Phong': 'entTPBank',
      'Joint Stock Commercial Bank Tien Phong': 'entTPBank',
      'Dabaco': 'entDabaco',
      'DIC Group': 'entDICGroup',
      'DPR': 'entDPR',
      'Đất Xanh Group': 'entDatXanh',
      'Eximbank': 'entEximbank',
      'FPT': 'entFPT',
      'FRT': 'entFRT',
      'FPT Retail': 'entFRT',
      'Gemadept': 'entGemadept',
      'Gelex Group': 'entGelex',
      'GVR': 'entGVR',
      'Hải An': 'entHaiAnTransport',
      'HDBank': 'entHDBank',
      'Hòa Phát': 'entHoaPhat',
      'Hoa Phat': 'entHoaPhat',
      'HSC Securities': 'entHSC',
      'IDICO': 'entIDICO',
      'I.D.I': 'entIDI',
      'ITACO': 'entTanTao',
      'Khang Điền': 'entKhangDien',
      'KIDO': 'entKIDO',
      'Kienlongbank': 'entKienlongbank',
      'Kinh Bắc City': 'entKinhBacCity',
      'Lộc Trời': 'entLocTroi',
      'LPBank': 'entLPBank',
      'Masan Group': 'entMasan',
      'Masan Consumer': 'entMasanConsumer',
      'MBBank': 'entMBBank',
      'MSB': 'entMSB',
      'MWG': 'entMWG',
      'NamABank': 'entNamABank',
      'Nam Long': 'entNamLong',
      'NCB': 'entNCB',
      'Novaland': 'entNovaland',
      'OCB': 'entOCB',
      'PAN': 'entPANGroup',
      'PAN Group': 'entPANGroup',
      'Petrolimex': 'entPetrolimex',
      'Phát Đạt': 'entPhatDat',
      'PHR': 'entPHR',
      'PJICO': 'entPJICO',
      'PLC': 'entPetrolimexPetrochemical',
      'PTI': 'entPTI',
      'PTSC': 'entPTSC',
      'PV Drilling': 'entPVDrilling',
      'PV GAS': 'entPVGas',
      'PV Power': 'entPVPower',
      'PVChem': 'entPVChem',
      'PVT': 'entPVT',
      'QNS': 'entQNS',
      'Sacombank': 'entSacombank',
      'Sao Mai': 'entSaoMai',
      'SBT': 'entSBT',
      'SeABank': 'entSeABank',
      'SHB': 'entSHB',
      'SSI Securities': 'entSSI',
      'Tasco': 'entTasco',
      'Techcombank': 'entTechcombank',
      'Thế giới Di động': 'entMWG',
      'TKV': 'entTKV',
      'TPBank': 'entTPBank',
      'TTC Sugar': 'entTTCSugar',
      'VEAM': 'entVEAM',
      'VIB': 'entVIB',
      'Viet A Commercial Joint Stock Bank': 'entVietABank',
      'Viet ABank': 'entVietABank',
      'VietABank': 'entVietABank',
      'Viet Capital Securities': 'entVietCapital',
      'VCSC': 'entVietCapital',
      'Vietcombank': 'entVietcombank',
      'VietinBank': 'entVietinBank',
      'Vietjet Air': 'entVietjet',
      'Viettel': 'entViettelGroup',
      'Viettel Construction': 'entViettelConstruction',
      'Viettel Post': 'entViettelPost',
      'Việt Tiến': 'entVietTien',
      'Viglacera': 'entViglacera',
      'Vinachem': 'entVinachem',
      'Vinacomin': 'entTKV',
      'Vinamilk': 'entVinamilk',
      'Vinatea': 'entVinatea',
      'Vinataba': 'entVinataba',
      'Vincom Retail': 'entVincomRetail',
      'Vingroup': 'entVingroup',
      'Vinhomes': 'entVinhomes',
      'Vinataba ': 'entVinataba',
      'Vinafor': 'entVinafor',
      'Vietnam Airlines': 'entVietnamAirlines',
      'VPBank': 'entVPBank',
      'VPS Securities': 'entVPS',
      'VNDIRECT': 'entVndirect',
      'Công ty Cổ phần BCG Land': 'entBCGLand',
      'Công ty Cổ phần Bán lẻ Kỹ thuật số FPT': 'entFRT',
      'Công ty Cổ phần Cao su Đồng Phú': 'entDPR',
      'Công ty Cổ phần Cao su Phước Hòa': 'entPHR',
      'Công ty Cổ phần Chứng khoán Bản Việt': 'entVietCapital',
      'Công ty Cổ phần Chứng khoán MB': 'entMBS',
      'Công ty Cổ phần Chứng khoán SSI': 'entSSI',
      'Công ty Cổ phần Chứng khoán TP.HCM (HSC)': 'entHSC',
      'Công ty Cổ phần Chứng khoán VNDIRECT': 'entVndirect',
      'Công ty Cổ phần Công nghiệp Cao su Việt Nam': 'entGVR',
      'Công ty Cổ phần Gemadept': 'entGemadept',
      'Công ty Cổ phần Hàng không Vietjet': 'entVietjet',
      'Công ty Cổ phần Hàng tiêu dùng Masan': 'entMasanConsumer',
      'Công ty Cổ phần Lọc hóa dầu Bình Sơn': 'entBSR',
      'Công ty Cổ phần Phát triển Bất động sản Phát Đạt': 'entPhatDat',
      'Công ty Cổ phần Phát triển Hạ tầng Kỹ thuật': 'entTechnicalInfrastructure',
      'Công ty Cổ phần Sữa Việt Nam': 'entVinamilk',
      'Công ty Cổ phần Tập đoàn Bamboo Capital': 'entBambooCapital',
      'Công ty Cổ phần Tập đoàn C.E.O': 'entCEOGroup',
      'Công ty Cổ phần Tập đoàn Đất Xanh': 'entDatXanh',
      'Công ty Cổ phần Tập đoàn Gelex': 'entGelex',
      'Công ty Cổ phần Tập đoàn Hòa Phát': 'entHoaPhat',
      'Công ty Cổ phần Tập đoàn Đầu tư Địa ốc No Va': 'entNovaland',
      'Công ty Cổ phần Tập đoàn KIDO': 'entKIDO',
      'Công ty Cổ phần Tập đoàn Masan': 'entMasan',
      'Công ty Cổ phần Tập đoàn Pan': 'entPANGroup',
      'Công ty Cổ phần Tập đoàn Sao Mai': 'entSaoMai',
      'Công ty Cổ phần Thành Thành Công - Biên Hòa': 'entTTCSugar',
      'Công ty Cổ phần Vinhomes': 'entVinhomes',
      'Công ty Cổ phần Vincom Retail': 'entVincomRetail',
      'Công ty Cổ phần Vận tải Dầu khí': 'entPVT',
      'Công ty Cổ phần Vận tải và Xếp dỡ Hải An': 'entHaiAnTransport',
      'Công ty Cổ phần Đường Quảng Ngãi': 'entQNS',
      'Công ty Cổ phần Đầu tư Hạ tầng Kỹ thuật Thành phố Hồ Chí Minh': 'entCII',
      'Công ty Cổ phần Đầu tư Nam Long': 'entNamLong',
      'Công ty Cổ phần Đầu tư Tasco': 'entTasco',
      'Công ty Cổ phần Đầu tư Thế giới Di động': 'entMWG',
      'Công ty Cổ phần Đầu tư và Công nghiệp Tân Tạo': 'entTanTao',
      'Công ty Cổ phần Đầu tư và Kinh doanh Nhà Khang Điền': 'entKhangDien',
      'Công ty Cổ phần Đầu tư và Phát triển Bất động sản An Gia': 'entAnGia',
      'Công ty Cổ phần Đầu tư và Phát triển Đa Quốc gia I.D.I': 'entIDI',
      'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam': 'entAgribank',
      'Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam': 'entVietcombank',
      'Ngân hàng TMCP An Bình': 'entABBank',
      'Ngân hàng TMCP Á Châu': 'entACB',
      'Ngân hàng TMCP Bắc Á': 'entBacABank',
      'Ngân hàng TMCP Bản Việt': 'entBVBank',
      'Ngân hàng TMCP Công Thương Việt Nam': 'entVietinBank',
      'Ngân hàng TMCP Đông Nam Á': 'entSeABank',
      'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam': 'entBidv',
      'Ngân hàng TMCP Hàng Hải Việt Nam': 'entMSB',
      'Ngân hàng TMCP Kiên Long': 'entKienlongbank',
      'Ngân hàng TMCP Kỹ thương Việt Nam': 'entTechcombank',
      'Ngân hàng TMCP Lộc Phát Việt Nam': 'entLPBank',
      'Ngân hàng TMCP Nam Á': 'entNamABank',
      'Ngân hàng TMCP Ngoại thương Việt Nam': 'entVietcombank',
      'Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh': 'entHDBank',
      'Ngân hàng TMCP Phương Đông': 'entOCB',
      'Ngân hàng TMCP Quân Đội': 'entMBBank',
      'Ngân hàng TMCP Quốc Dân': 'entNCB',
      'Ngân hàng TMCP Quốc tế Việt Nam': 'entVIB',
      'Ngân hàng TMCP Sài Gòn - Hà Nội': 'entSHB',
      'Ngân hàng TMCP Sài Gòn Thương Tín': 'entSacombank',
      'Ngân hàng TMCP Tiên Phong': 'entTPBank',
      'Ngân hàng TMCP Việt Á': 'entVietABank',
      'Ngân hàng TMCP Việt Nam Thịnh Vượng': 'entVPBank',
      'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam': 'entEximbank',
      'Tập đoàn Bảo Việt': 'entBaoViet',
      'Tập đoàn Công nghiệp - Viễn thông Quân đội': 'entViettelGroup',
      'Tập đoàn Công nghiệp Cao su Việt Nam': 'entGVR',
      'Tập đoàn Dầu khí Việt Nam': 'entPVGas',
      'Tập đoàn Dabaco Việt Nam': 'entDabaco',
      'Tập đoàn Điện lực Việt Nam': 'entEVN',
      'Tập đoàn FPT': 'entFPT',
      'Tập đoàn Hòa Phát': 'entHoaPhat',
      'Tập đoàn Hóa chất Việt Nam': 'entVinachem',
      'Tập đoàn Lộc Trời': 'entLocTroi',
      'Tập đoàn Masan': 'entMasan',
      'Tập đoàn Novaland': 'entNovaland',
      'Tập đoàn Than - Khoáng sản Việt Nam': 'entTKV',
      'Tập đoàn Vingroup': 'entVingroup',
      'Tập đoàn Xăng dầu Việt Nam': 'entPetrolimex',
      'Tổng Công ty Cổ phần Bảo hiểm Bưu điện': 'entPTI',
      'Tổng Công ty Cổ phần Bảo hiểm Petrolimex': 'entPJICO',
      'Tổng Công ty Cổ phần Bảo Minh': 'entBaoMinh',
      'Tổng Công ty Cổ phần Bưu chính Viettel': 'entViettelPost',
      'Tổng Công ty Cổ phần Công trình Viettel': 'entViettelConstruction',
      'Tổng Công ty Cổ phần Dịch vụ Kỹ thuật Dầu khí Việt Nam': 'entPTSC',
      'Tổng Công ty Cổ phần Đầu tư Phát triển Xây dựng': 'entDICGroup',
      'Tổng Công ty Cổ phần Khoan và Dịch vụ Khoan Dầu khí': 'entPVDrilling',
      'Tổng Công ty Cổ phần May Việt Tiến': 'entVietTien',
      'Tổng Công ty Cổ phần Vận tải Dầu khí': 'entPVT',
      'Tổng Công ty Chè Việt Nam': 'entVinatea',
      'Tổng Công ty Du lịch Sài Gòn': 'entSaigontourist',
      'Tổng Công ty Điện lực Dầu khí Việt Nam': 'entPVPower',
      'Tổng Công ty Đầu tư và Phát triển Công nghiệp': 'entBecamexIDC',
      'Tổng Công ty Hàng không Việt Nam': 'entVietnamAirlines',
      'Tổng Công ty Hóa chất và Dịch vụ Dầu khí': 'entPVChem',
      'Tổng Công ty Hóa dầu Petrolimex': 'entPetrolimexPetrochemical',
      'Tổng Công ty IDICO': 'entIDICO',
      'Tổng Công ty Khí Việt Nam': 'entPVGas',
      'Tổng Công ty Lâm nghiệp Việt Nam': 'entVinafor',
      'Tổng Công ty Máy động lực và Máy nông nghiệp Việt Nam': 'entVEAM',
      'Tổng Công ty Phát triển Đô thị Kinh Bắc': 'entKinhBacCity',
      'Tổng Công ty Thuốc lá Việt Nam': 'entVinataba',
      'Tổng Công ty Truyền tải điện Quốc gia': 'entEVNNPT',
      'Tổng Công ty Viglacera': 'entViglacera',
      'Tổng Công ty Cổ phần Bia - Rượu - Nước giải khát Hà Nội': 'entHABECO',
      'Tổng Công ty Cổ phần Bia - Rượu - Nước giải khát Sài Gòn': 'entSABECO'
    };

    // 1. Try exact match in current language
    let translation = translations[language][key as keyof typeof translations.vi];
    if (translation) return translation;

    // Special case for enterprise names if in English mode
    if (language === 'en') {
      if (ticker && tickerMap[ticker]) {
        const transKey = tickerMap[ticker];
        return translations.en[transKey as keyof typeof translations.en] || key;
      }

      if (industryMap[key]) {
        return translations[language][industryMap[key]] || translations.vi[industryMap[key]];
      }

      if (enterpriseMap[key]) {
        return translations[language][enterpriseMap[key]] || translations.vi[enterpriseMap[key]];
      }
    }

    // 3. Try case-insensitive match for other keys
    if (language === 'en' && typeof key === 'string') {
      let result = key as string;
      const replacements: Record<string, string> = {
        'Ngân hàng Thương mại Cổ phần': 'Joint Stock Commercial Bank',
        'Ngân hàng TMCP': 'Joint Stock Commercial Bank',
        'Công ty Cổ phần': 'Joint Stock Company',
        'Công ty TNHH MTV': 'One Member Limited Liability Company',
        'Công ty TNHH': 'Limited Liability Company',
        'Nông nghiệp và Phát triển Nông thôn': 'Bank for Agriculture and Rural Development',
        'Tổng Công ty': 'Corporation',
        'Cổ phần': 'Joint Stock',
        'Tập đoàn': 'Group',
        'Chứng khoán': 'Securities',
        'Bất động sản': 'Real Estate',
        'Địa ốc': 'Real Estate',
        'Đầu tư': 'Investment',
        'Phát triển': 'Development',
        'Thương mại': 'Commercial',
        'Công nghiệp': 'Industry',
        'Dịch vụ': 'Services',
        'Sản xuất': 'Manufacturing',
        'Xây dựng': 'Construction',
        'Giao thông': 'Transport',
        'Hạ tầng': 'Infrastructure',
        'Kỹ thuật': 'Technical',
        'Thiết bị': 'Equipment',
        'Điện lực': 'Power',
        'Năng lượng': 'Energy',
        'Dầu khí': 'Petroleum',
        'Hàng không': 'Aviation',
        'Vận tải': 'Transport',
        'Vật liệu': 'Materials',
        'Thực phẩm': 'Food',
        'Đồ uống': 'Beverage',
        'Sữa': 'Dairy',
        'Cao su': 'Rubber',
        'Hóa chất': 'Chemicals',
        'Phân bón': 'Fertilizer',
        'Dệt may': 'Textile',
        'Thủy sản': 'Fishery',
        'Nông nghiệp': 'Agriculture',
        'Lâm nghiệp': 'Forestry',
        'Bưu chính': 'Post',
        'Viễn thông': 'Telecommunications',
        'Công nghệ': 'Technology',
        'Tài chính': 'Finance',
        'Bảo hiểm': 'Insurance',
        'Môi trường': 'Environment',
        'Y tế': 'Medical',
        'Dược phẩm': 'Pharmaceutical',
        'Giáo dục': 'Education',
        'Du lịch': 'Tourism',
        'Khách sạn': 'Hotel',
        'Giải trí': 'Entertainment',
        'Phim': 'Film',
        'Truyền thông': 'Media',
        'Sách': 'Books',
        'Việt Nam': 'Vietnam',
        'Thành phố': 'City',
        'Hồ Chí Minh': 'Ho Chi Minh',
        'Sài Gòn': 'Saigon',
        'Hà Nội': 'Ha Noi',
        'Đà Nẵng': 'Da Nang',
        'Hải Phòng': 'Hai Phong',
        'Cần Thơ': 'Can Tho',
        'Bình Dương': 'Binh Duong',
        'Đồng Nai': 'Dong Nai',
        'Tiên Phong': 'Tien Phong',
        'Aviation': 'Aviation',
        'và': 'and',
        'Ngoại thương': 'Foreign Trade',
        'Đầu tư và Phát triển': 'Investment and Development',
        'Công Thương': 'Industry and Trade',
        'Kỹ thương': 'Technological and Commercial',
        'Quân Đội': 'Military',
        'Việt Nam Thịnh Vượng': 'Vietnam Prosperity',
        'Sài Gòn Thương Tín': 'Sacombank (STB)',
        'Bưu điện Liên Việt': 'LPBank',
        'Hàng Hải': 'Maritime',
        'Đông Nam Á': 'SeABank',
        'Xuất Nhập Khẩu': 'Eximbank',
        'Đông Á': 'DongA Bank',
        'Bản Việt': 'BVBank',
        'Nam Á': 'Nam A Bank',
        'Đại Chúng': 'PVcomBank',
        'Phương Đông': 'OCB',
        'Liên doanh': 'Joint Venture',
        'Phát triển TP.HCM': 'HDBank',
        'Quốc tế': 'International',
        'Miền Bắc': 'Northern',
        'Miền Trung': 'Central',
        'Miền Nam': 'Southern',
        'Bắc': 'North',
        'Trung': 'Central',
        'Nam': 'South',
        'Đông': 'East',
        'Tây': 'West'
      };

      // Handle common abbreviations first to be safe
      result = result.replace(/ - CTCP$/g, ' JSC');
      result = result.replace(/ CTCP$/g, ' JSC');
      result = result.replace(/-CTCP$/g, 'JSC');
      result = result.replace(/ JSC$/g, ' Joint Stock Company');

      if (result.toUpperCase().startsWith('CTCP ')) {
        result = result.substring(5) + ' JSC';
      }
      if (result.toUpperCase().startsWith('CÔNG TY CỔ PHẦN ')) {
        result = result.substring(16) + ' Joint Stock Company';
      }

      // Sort replacements by length descending to replace longer phrases first
      const sortedReplacements = Object.entries(replacements).sort((a, b) => b[0].length - a[0].length);

      for (const [vi, en] of sortedReplacements) {
        // Use regex for whole word replacement to avoid partial matches inside other words
        // Note: Vietnamese characters in unicode are handled by regex engine
        const regex = new RegExp(`\\b${vi}\\b`, 'gi');
        result = result.replace(regex, en);
      }
      
      // Clean up multiple spaces and final polish
      result = result.replace(/\s\s+/g, ' ').trim();
      
      return result;
    }

    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
