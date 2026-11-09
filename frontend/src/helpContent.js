/** Central de Dúvidas: aulas curtas, uma trilha por aba do sistema (na ordem de uso). */
export const HELP = [
  {
    id: "comeco", title: "Primeiros passos", icon: "🚀",
    lessons: [
      { t: "Conectar o WhatsApp", steps: ["Abra a aba Canais.", "Clique em Conectar WhatsApp.", "No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.", "Aponte a câmera para o QR Code. Em alguns segundos o canal fica verde."], tip: "Mantenha o celular com internet nos primeiros minutos para as conversas sincronizarem." },
      { t: "Trazer o histórico de outro sistema", steps: ["Em Canais, clique em Importar histórico no seu WhatsApp.", "Confirme e leia o QR Code de novo.", "As conversas dos últimos 90 dias aparecem aos poucos em Conversas."] },
      { t: "Cadastrar a equipe", steps: ["Configurações → Equipe & Permissões → novo usuário.", "Escolha o perfil: Gestor vê tudo, Atendente vê só o que é dele.", "A pessoa recebe o acesso por e-mail."] },
      { t: "Criar setores", steps: ["Configurações → Setores.", "Crie, por exemplo: Comercial, Sinistro, Financeiro.", "Coloque cada atendente no seu setor."] }
    ]
  },
  {
    id: "conversas", title: "Conversas", icon: "💬",
    lessons: [
      { t: "Atender uma conversa", steps: ["Clique na conversa na lista da esquerda.", "Clique em Aceitar para assumir o atendimento.", "Ao terminar, clique em Finalizar."] },
      { t: "Transferir para outra pessoa ou setor", steps: ["Dentro da conversa, clique em Transferir.", "Escolha o setor ou o atendente.", "Escreva uma observação, se quiser, e confirme."] },
      { t: "Enviar áudio, foto e arquivo", steps: ["Clique no + ao lado do campo de mensagem para anexar.", "Segure o microfone para gravar um áudio.", "Arraste arquivos direto para a conversa, se preferir."] },
      { t: "Respostas prontas", steps: ["Digite / no campo de mensagem.", "Escolha a resposta salva na lista.", "Cadastre novas em Configurações → Respostas prontas."] },
      { t: "Silenciar conversa ou grupo", steps: ["Abra a conversa.", "Clique no sininho no topo.", "Ela continua chegando, mas sem som e sem notificação."] },
      { t: "Carregar mensagens antigas", steps: ["Role a conversa até o começo.", "Clique em Buscar mensagens antigas no WhatsApp."] }
    ]
  },
  {
    id: "crm", title: "CRM", icon: "📊",
    lessons: [
      { t: "Criar um negócio", steps: ["Abra o CRM e escolha o funil (tipo de seguro).", "Clique em Novo lead.", "Preencha cliente, telefone e os campos do funil."] },
      { t: "Mover entre etapas", steps: ["Arraste o card para a coluna seguinte.", "Ou abra o card e troque a etapa no topo."] },
      { t: "Ganho e perdido", steps: ["Abra o card.", "Clique em Ganho ou Perdido.", "No perdido, informe o motivo: ele aparece nos relatórios."] },
      { t: "Ver tudo de um cliente", steps: ["Abra qualquer card do cliente.", "Clique em Ver cliente.", "Veja todos os negócios, o histórico e as pessoas.", "Use Adicionar negócio para abrir outro seguro para o mesmo cliente."] },
      { t: "Ver em lista", steps: ["No topo do CRM, clique em Lista.", "Clique no nome de uma coluna para ordenar.", "Clique na linha para abrir o card."] },
      { t: "Relatório em Excel", steps: ["No CRM, clique em ⋯ (Mais opções).", "Escolha Relatório em planilha (Excel).", "Filtre por funil, situação e período e clique em Baixar Excel."] },
      { t: "Criar uma tarefa no card", steps: ["Abra o card.", "Vá na aba Tarefa.", "Defina o que fazer, a data e o responsável."], tip: "Anotações do card não viram tarefa sozinhas: para isso use a aba Tarefa." },
      { t: "Campos personalizados", steps: ["No CRM, clique em ⋯ → Campos.", "Adicione campos como Apólice, Seguradora, Vigência.", "Marque No card para o campo aparecer no Kanban."] },
      { t: "Automações", steps: ["No CRM, clique em ⋯ → Automações.", "Escolha quando acontece: ao entrar numa etapa, por exemplo.", "Escolha a ação: mandar mensagem, mover, criar tarefa."] },
      { t: "Arquivar e reagendar", steps: ["Abra o card e clique em ⋯.", "Arquivar tira o card do funil sem apagar.", "Reagendar faz ele voltar como novo na data escolhida."] }
    ]
  },
  {
    id: "tarefas", title: "Tarefas", icon: "✅",
    lessons: [
      { t: "Criar e acompanhar tarefas", steps: ["Abra a aba Tarefas.", "Clique em Nova tarefa e defina responsável e prazo.", "Arraste entre as colunas conforme o andamento."] }
    ]
  },
  {
    id: "ia", title: "Helora IA", icon: "✨",
    lessons: [
      { t: "Ensinar a IA (Cérebro)", steps: ["Abra Helora IA → Cérebro.", "Envie documentos, PDFs e textos sobre a sua empresa.", "A IA passa a responder usando esse conteúdo."] },
      { t: "Ligar a atendente IA", steps: ["Helora IA → Atendente.", "Defina o nome, o jeito de falar e quando passar para um humano.", "Ative no canal desejado."] },
      { t: "Acompanhar o uso do mês", steps: ["Na aba Helora IA, veja a barra de atendimentos.", "1 atendimento = 1 conversa no mês, mesmo com várias mensagens.", "O contador zera no dia 1º."] }
    ]
  },
  {
    id: "fluxos", title: "Fluxos e campanhas", icon: "🔀",
    lessons: [
      { t: "Criar um fluxo de atendimento", steps: ["Abra Fluxos → Novo fluxo.", "Monte o menu de boas-vindas com as opções.", "Ligue cada opção a um setor ou resposta."] },
      { t: "Enviar campanhas", steps: ["Abra Campanhas → Nova campanha.", "Escolha os contatos ou etiquetas.", "Escreva a mensagem e agende o envio."], tip: "Envie para quem já conversa com você, para evitar bloqueio do número." }
    ]
  },
  {
    id: "relatorios", title: "Relatórios", icon: "📈",
    lessons: [
      { t: "Ver os números da equipe", steps: ["Abra Relatórios.", "Escolha o período no topo.", "Veja atendimentos, tempo de resposta e resultados do CRM."] },
      { t: "Carteira de clientes", steps: ["Relatórios → Carteira.", "Veja os clientes ganhos, vencimentos e renovações."] }
    ]
  }
];
