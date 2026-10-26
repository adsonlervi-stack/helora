// Listas de seguro compartilhadas (backend e painel usam o mesmo conteúdo).
export const SEGURADORAS = [
  "AIG", "Akad", "Alfa Seguros", "Alice", "Allianz", "Amil", "Argo", "Assurant", "Austral", "Azul Seguros", "BB Seguros (Brasilseg)",
  "Berkley", "BMG Seguros", "Bradesco Saúde", "Bradesco Seguros", "Caixa Seguradora", "Capemisa", "Cardif", "Chubb", "Darwin",
  "Essor", "Excelsior", "EZZE", "Fairfax", "Generali", "Hapvida NotreDame", "HDI", "Icatu", "Itaú Seguros", "Junto Seguros",
  "Kovr", "MAG Seguros (Mongeral)", "Mapfre", "MetLife", "Mitsui Sumitomo", "Omint", "Porto Saúde", "Porto Seguro", "Pottencial",
  "Prudential", "Sancor", "Sompo", "Starr", "SulAmérica", "Suhai", "Swiss Re Corporate", "Tokio Marine", "Unimed", "Seguros Unimed",
  "Yelum (Liberty)", "Youse", "Zurich"
];

/** Ramos de seguro e seus produtos (subprodutos). */
export const RAMOS = {
  "Automóvel": ["Auto passeio", "Auto frota", "Moto", "Caminhão", "Utilitário / van", "Táxi / aplicativo", "Auto por assinatura", "Carta verde", "RCF-V (terceiros)"],
  "Residencial": ["Residencial habitual", "Residencial veraneio", "Residencial mensal"],
  "Condomínio": ["Condomínio residencial", "Condomínio comercial", "RC síndico"],
  "Vida": ["Vida individual", "Vida em grupo", "Acidentes pessoais (AP)", "AP escolar", "Prestamista", "Funeral", "Doenças graves", "Vida resgatável"],
  "Previdência": ["PGBL", "VGBL"],
  "Saúde": ["Saúde PF", "Saúde por adesão", "Saúde PME", "Saúde empresarial"],
  "Odonto": ["Odonto PF", "Odonto PME", "Odonto empresarial"],
  "Empresarial / patrimonial": ["Empresarial", "Riscos nomeados", "Riscos operacionais", "Lucros cessantes", "Equipamentos", "Riscos de engenharia / obras"],
  "Responsabilidade civil": ["RC geral", "RC profissional (E&O)", "D&O", "RC ambiental", "RC eventos", "Cyber"],
  "Transporte": ["Transporte nacional", "Transporte internacional", "RCTR-C", "RCF-DC", "RC-DC"],
  "Garantia / fiança": ["Seguro garantia judicial", "Garantia licitante / executante", "Fiança locatícia"],
  "Rural / agro": ["Agrícola", "Pecuário", "Penhor rural", "Máquinas agrícolas", "Florestas"],
  "Viagem": ["Viagem nacional", "Viagem internacional", "Intercâmbio"],
  "Aeronáutico": ["Casco aeronáutico", "RETA", "LUC (responsabilidade)"],
  "Náutico / marítimo": ["Embarcações", "Casco marítimo"],
  "Pessoais e eletrônicos": ["Celular", "Notebook / eletrônicos", "Bike", "Pet"],
  "Consórcio": ["Consórcio imóvel", "Consórcio auto", "Consórcio moto", "Consórcio pesados", "Consórcio serviços"],
  "Capitalização": ["Título de capitalização"]
};

/** Opções do campo "Produto" (dependente do ramo): "Ramo > Produto". */
export const PRODUTO_OPTIONS = Object.entries(RAMOS).flatMap(([r, ps]) => ps.map((p) => `${r} > ${p}`));
