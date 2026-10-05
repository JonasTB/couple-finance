/** Default pt-BR categories seeded into every new household (FR-CAT-01). Two levels. */
export const DEFAULT_CATEGORIES: readonly (readonly [string, readonly string[]])[] = [
  [
    'Moradia',
    [
      'Aluguel ou financiamento',
      'Condomínio',
      'Energia',
      'Água',
      'Gás',
      'Internet e telefone',
      'Manutenção',
    ],
  ],
  ['Mercado', ['Supermercado', 'Feira e hortifrúti', 'Padaria']],
  ['Alimentação fora', ['Restaurantes', 'Delivery', 'Café e lanches']],
  [
    'Transporte',
    [
      'Combustível',
      'Transporte público',
      'Aplicativos de transporte',
      'Estacionamento e pedágio',
      'Manutenção do veículo',
    ],
  ],
  ['Saúde', ['Plano de saúde', 'Farmácia', 'Consultas e exames']],
  ['Educação', ['Cursos', 'Livros e material']],
  ['Lazer', ['Viagens', 'Passeios e eventos', 'Hobbies']],
  ['Assinaturas', ['Streaming', 'Apps e serviços', 'Academia']],
  ['Casa e decoração', ['Móveis', 'Eletrodomésticos', 'Utensílios']],
  ['Pets', ['Alimentação do pet', 'Veterinário']],
  ['Cuidados pessoais', ['Roupas e calçados', 'Beleza e higiene']],
  ['Impostos e taxas', ['IPTU', 'IPVA', 'Tarifas bancárias']],
  ['Presentes e doações', []],
  ['Outros', []],
];
