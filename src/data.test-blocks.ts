export type LicenseBlock = {
  id: string;
  title: string;
  description: string;
  body: string;
  variables: string[];
};

export const TEST_BLOCKS: LicenseBlock[] = [
  {
    id: 'web',
    title: 'Веб-лицензия',
    description: 'Использование на сайтах через CSS',
    body: 'Лицензиат вправе использовать Шрифт для отображения на сайте {{domain}}.',
    variables: ['domain']
  },
  {
    id: 'desktop',
    title: 'Desktop-лицензия',
    description: 'Установка на рабочие станции',
    body: 'Допускается установка Шрифта на {{workstations_count}} рабочих станций.',
    variables: ['workstations_count']
  },
  {
    id: 'logo',
    title: 'Лицензия для логотипа',
    description: 'Использование в фирменном знаке',
    body: 'Лицензиат вправе использовать Шрифт в логотипе компании {{company_name}}.',
    variables: ['company_name']
  }
];

export const TEST_FRAME = {
  header: 'Лицензионный договор с {{company_name}} от {{contract_date}}',
  footer: 'Подписи сторон: Лицензиар __________ / Лицензиат __________'
};
