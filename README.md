# Fast GNOME Menu

Extensão para o GNOME Shell que abre um menu de energia interativo, no estilo do [wlogout](https://github.com/ArtsyMacaw/wlogout): um painel com botões quadrados e cantos arredondados para bloquear a tela, sair da sessão, suspender, trocar de usuário, reiniciar ou desligar.

O menu pode ser usado pelo teclado (setas ou teclas de atalho) ou pelo mouse, e segue o tema claro/escuro, a cor de destaque e o idioma do sistema.

## Sumário

- [Recursos](#recursos)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Como usar](#como-usar)
- [Configurações](#configurações)
- [Como funciona](#como-funciona)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Compilação e empacotamento](#compilação-e-empacotamento)
- [Traduções](#traduções)
- [Desenvolvimento e depuração](#desenvolvimento-e-depuração)
- [Problemas conhecidos](#problemas-conhecidos)

## Recursos

- Menu centralizado no monitor onde está o ponteiro, com o fundo escurecido.
- Botões lado a lado, num painel do tamanho exato deles, com disposição automática conforme a quantidade de ações (1 a 3 em linha, 4 em 2×2, 5 como a face de um dado, 6 em 2×3) ou em grade com número fixo de colunas.
- Sete ações nativas: **Bloquear**, **Sair**, **Suspender**, **Hibernar**, **Trocar usuário**, **Reiniciar** e **Desligar**. As quatro que vêm ativadas são Bloquear, Sair, Reiniciar e Desligar.
- **Ações personalizadas**: qualquer comando, com nome e ícone próprios (abrir um terminal, reiniciar no firmware, desligar o monitor…). O comando roda sem shell, então não há injeção de comandos.
- O botão selecionado fica com a cor de destaque do GNOME e uma borda mais forte, e cresce 10% com uma animação suave.
- Confirmação opcional: nenhuma ação, todas ou só as escolhidas. A confirmação mostra o botão da ação, uma contagem regressiva (60 s por padrão) com barra de progresso e os botões Cancelar e Confirmar, sobre um fundo mais escuro.
- Folhas de estilo separadas para o tema claro e o escuro, trocadas automaticamente pelo GNOME.
- Textos traduzidos para português do Brasil e espanhol (o inglês é o idioma de origem).
- Ícone opcional na barra superior.
- Preferências em três abas:
  - **Ações:** quais aparecem, em que ordem, e as ações personalizadas;
  - **Aparência:** disposição, tamanho dos botões, cantos, espaçamento, tamanho do ícone, quanto o botão selecionado cresce, cor de destaque própria, fundo do painel e escurecimento da tela;
  - **Comportamento:** atalho, ícone na barra, monitor onde abrir, qual ação vem selecionada (a primeira ou a última usada), fechar ao clicar fora, confirmação e restauração dos padrões.
- Leve: nada roda em segundo plano. O menu é montado só quando abre e destruído quando fecha.

## Pré-requisitos

### Para usar e compilar

| Pacote (Fedora) | Versão | Fornece | Para quê |
|---|---|---|---|
| `gnome-shell` | 48, 49 ou 50 | GNOME Shell e o comando `gnome-extensions` | Rodar a extensão, ativá-la e gerar o `.zip` |
| `gjs` | a que acompanha o GNOME | Interpretador JavaScript do GNOME | Rodar o código da extensão e das preferências |
| `glib2` | qualquer recente | `glib-compile-schemas` | Compilar o schema de configurações |
| `gettext` | qualquer recente | `msgfmt`, `xgettext`, `msgmerge` | Compilar e atualizar as traduções |

`gnome-shell` e `gjs` já vêm com qualquer instalação do GNOME. O `build.sh` também precisa do `bash`.

### Para testar sem sair da sessão (`./build.sh dev`)

| Pacote (Fedora) | Versão | Fornece | Para quê |
|---|---|---|---|
| `mutter-devkit` | a mesma do GNOME Shell | Janela que hospeda a sessão aninhada | Rodar o GNOME Shell dentro de uma janela (GNOME 49+) |
| `dbus-daemon` | qualquer recente | `dbus-run-session` | Dar à sessão aninhada um barramento D-Bus próprio |

O Fedora não instala o `dbus-daemon` por padrão porque usa o `dbus-broker` como barramento do sistema. Os dois convivem sem problema: o `dbus-daemon` só é usado quando chamado pelo `dbus-run-session`.

No GNOME 48, a sessão aninhada usa `--nested` e não precisa do `mutter-devkit`.

O `./build.sh dev` verifica esses dois pacotes antes de começar e informa qual falta.

### Instalação dos pacotes

| Comando | Precisa de |
|---|---|
| `./build.sh`, `install`, `pack`, `pot`, `prefs` | `gnome-shell`, `gjs`, `glib2`, `gettext` |
| `./build.sh dev` | os anteriores, mais `mutter-devkit` e `dbus-daemon` |
| `./build.sh test` | os anteriores, mais `dbus-daemon` e `dbus-tools` |

No Fedora, tudo de uma vez:

```sh
sudo dnf install gnome-shell gjs glib2 gettext mutter-devkit dbus-daemon dbus-tools
```

No Debian/Ubuntu (apenas para usar e compilar; os nomes dos pacotes da sessão aninhada variam entre versões):

```sh
sudo apt install gnome-shell gjs libglib2.0-bin gettext
```

## Instalação

### A partir do código-fonte

```sh
git clone https://github.com/wvmj-dev/fast-gnome-menu.git
cd fast-gnome-menu
./build.sh install
```

O comando compila o schema e as traduções e copia a extensão para `~/.local/share/gnome-shell/extensions/fast-gnome-menu@wvmj-dev.github.io`.

Depois disso:

1. **Saia e entre de novo na sessão.** No Wayland, o GNOME Shell só detecta extensões novas após um novo login.
2. Ative a extensão:

   ```sh
   gnome-extensions enable fast-gnome-menu@wvmj-dev.github.io
   ```

   Ou use o aplicativo **Extensões**.

### A partir do `.zip`

```sh
./build.sh pack
gnome-extensions install --force fast-gnome-menu@wvmj-dev.github.io.shell-extension.zip
```

Em seguida, siga os passos 1 e 2 acima.

### Desinstalação

```sh
gnome-extensions uninstall fast-gnome-menu@wvmj-dev.github.io
```

## Como usar

Abra o menu com **`Super+X`** (atalho padrão) ou clicando no ícone de energia na barra superior.

| Tecla | Efeito |
|---|---|
| `←` `→` `↑` `↓` | Vai para o botão vizinho naquela direção. No fim de uma linha ou coluna, volta para o outro extremo |
| `Tab` / `Shift+Tab` | Próximo / anterior, na ordem das ações |
| `Enter` / `Espaço` | Executa a ação selecionada (ou abre a confirmação dela) |
| `1` … `9` | Executa a ação naquela posição (ou abre a confirmação dela) |
| Letra da ação | Executa a ação diretamente (tabela abaixo), ou abre a confirmação dela |
| `Esc`, o atalho de abrir ou clique fora do painel | Fecha o menu |

| Ação | Letra | Ícone |
|---|---|---|
| Bloquear | `L` | `system-lock-screen-symbolic` |
| Sair | `E` | `system-log-out-symbolic` |
| Suspender | `S` | `weather-clear-night-symbolic` |
| Hibernar | `H` | `drive-harddisk-symbolic` |
| Trocar usuário | `U` | `system-switch-user-symbolic` |
| Reiniciar | `R` | `system-reboot-symbolic` |
| Desligar | `P` | `system-shutdown-symbolic` |

As letras são fixas, para não mudarem quando o idioma do sistema muda. Ações personalizadas não têm letra, mas podem ser acionadas pelo número da posição. Passar o mouse sobre um botão também o seleciona.

Os números e letras não aparecem nos botões, mas continuam funcionando.

### Na tela de confirmação

| Tecla | Efeito |
|---|---|
| `Enter` / `Espaço` | Aciona o botão em foco. Ao abrir, o foco está em Cancelar (configurável em `confirm-default`), para que um `Enter` a mais não execute a ação |
| `←` `→` / `Tab` | Alterna entre Cancelar e Confirmar |
| `Esc` ou clique fora do painel | Cancela e volta ao menu, com a mesma ação selecionada |

Quando a contagem chega a zero, a ação é executada sozinha, como na janela de desligamento do GNOME.

Uma ação que o sistema não permite no momento (por exemplo, bloquear a tela desativado por política, ou suspender sem suporte do hardware) aparece esmaecida, e a seleção pula por cima dela.

## Configurações

Abra as preferências pelo aplicativo **Extensões** ou com:

```sh
gnome-extensions prefs fast-gnome-menu@wvmj-dev.github.io
```

As alterações valem a partir da próxima vez que o menu for aberto.

| Chave GSettings | Tipo | Padrão | Descrição |
|---|---|---|---|
| `actions` | `as` | `['lock-screen', 'logout', 'restart', 'power-off']` | Ações exibidas, na ordem |
| `layout` | `s` | `'auto'` | Disposição dos botões: `'auto'` (conforme a quantidade) ou `'grid'` (número fixo de colunas) |
| `columns` | `i` (1–6) | `4` | Botões por linha, no modo grade |
| `custom-actions` | `a(ssss)` | `[]` | Ações personalizadas: `(id, nome, ícone, comando)`. O id começa com `custom-` |
| `button-size` | `i` (64–256) | `128` | Tamanho dos botões, em pixels |
| `corner-radius` | `i` (0–64) | `24` | Raio dos cantos, em pixels |
| `spacing` | `i` (0–64) | `16` | Espaço entre os botões, em pixels |
| `icon-size` | `i` (20–70) | `34` | Tamanho do ícone, em % do botão |
| `focus-scale` | `i` (100–130) | `110` | Tamanho do botão selecionado, em %; `100` desliga o aumento |
| `highlight-color` | `s` | `''` | Cor de destaque no formato `#rrggbb`; vazio usa a cor de destaque do sistema |
| `show-panel` | `b` | `true` | Desenha o painel atrás dos botões; desligado, eles flutuam sobre a tela |
| `backdrop-opacity` | `i` (0–100) | `50` | Escurecimento do fundo, em % |
| `show-labels` | `b` | `true` | Mostra o nome da ação sob o ícone |
| `toggle-menu` | `as` | `['<Super>x']` | Atalho que abre/fecha o menu |
| `monitor` | `s` | `'pointer'` | Onde o menu abre: `'pointer'` (monitor do ponteiro) ou `'primary'` (monitor principal) |
| `initial-focus` | `s` | `'first'` | Ação selecionada ao abrir: `'first'` (a primeira) ou `'last'` (a última usada, guardada em `last-action`) |
| `close-on-click-outside` | `b` | `true` | Fecha o menu ao clicar fora do painel |
| `confirm-mode` | `s` | `'none'` | Quais ações pedem confirmação: `'none'` (nenhuma), `'all'` (todas) ou `'custom'` (as de `confirm-list`) |
| `confirm-list` | `as` | `['logout', 'restart', 'power-off']` | Ações que pedem confirmação quando `confirm-mode` é `'custom'` |
| `confirm-timeout` | `i` (5–300) | `60` | Segundos até a confirmação executar a ação sozinha |
| `confirm-default` | `s` | `'cancel'` | Botão focado ao abrir a confirmação: `'cancel'` ou `'confirm'` |
| `show-indicator` | `b` | `true` | Mostra o ícone na barra superior |

Os identificadores aceitos em `actions` são `lock-screen`, `logout`, `suspend`, `switch-user`, `restart` e `power-off`.

As chaves também podem ser alteradas pelo terminal:

```sh
SCHEMA=org.gnome.shell.extensions.fast-gnome-menu
DIR=~/.local/share/gnome-shell/extensions/fast-gnome-menu@wvmj-dev.github.io/schemas

gsettings --schemadir "$DIR" set $SCHEMA actions "['lock-screen', 'suspend', 'restart', 'power-off']"
gsettings --schemadir "$DIR" set $SCHEMA toggle-menu "['<Control><Alt>p']"
```

## Como funciona

### Abertura do menu

O atalho é registrado com `Main.wm.addKeybinding` e funciona na área de trabalho e no Panorama. Ele também funciona com o menu aberto, para poder fechá-lo, mas não abre o menu por cima de outro diálogo do sistema.

Ao abrir, a extensão:

1. cria uma camada do tamanho da tela inteira (`PowerMenu`), que escurece o fundo e recebe os cliques fora do painel;
2. posiciona o painel no centro do monitor atual (`Main.layoutManager.currentMonitor`) e distribui os botões conforme a disposição escolhida (veja abaixo);
3. chama `Main.pushModal`, que captura teclado e mouse até o menu fechar;
4. coloca o foco no primeiro botão disponível e anima a entrada (opacidade e escala).

### Disposição dos botões

Os botões ficam lado a lado e um abaixo do outro, separados por um espaçamento de 12% do tamanho do botão. O painel tem exatamente o tamanho do conjunto, mais esse espaçamento nas bordas.

**Automática** (`layout = 'auto'`, padrão):

| Ações | Disposição |
|---|---|
| 1 | Só o botão |
| 2 ou 3 | Uma linha |
| 4 | Quadrado 2×2 |
| 5 | Como o de 4, com um no meio (face 5 de um dado ⚄) |
| 6 | Duas linhas de três (2×3) |
| 7 ou mais | Linhas de até ⌈√(1,5·n)⌉ botões, com a última linha centralizada |

```
1        2 ou 3        4          5              6

[■]      [■][■][■]     [■][■]     [■]    [■]     [■][■][■]
                       [■][■]        [■]         [■][■][■]
                                  [■]    [■]
```

No padrão de 5, os botões do meio de cada lado ficam vazios: para que o do centro não se sobreponha aos cantos, eles precisam estar uma posição inteira afastados.

**Grade** (`layout = 'grid'`): linhas de `columns` botões; se a última linha tiver menos botões, ela fica centralizada.

As posições são calculadas pela função `getCells()` em [extension.js](extension.js), e os botões são posicionados um a um dentro do painel.

### Navegação pelas setas

As setas usam a posição real dos botões na tela. Entre os botões à frente na direção pressionada, a extensão escolhe o de menor `distância / √cos(ângulo)`:

- numa grade, o vizinho em linha reta sempre ganha do diagonal;
- no padrão de 5, o botão do meio, que está na diagonal mas bem mais perto, ganha dos cantos. Assim, de um canto, `→` ou `↓` vai para o meio e, do meio, a mesma seta continua para o canto do lado de onde você veio (canto superior esquerdo → `→` → meio → `→` → canto superior direito);
- se não houver botão naquela direção, a seleção volta para o outro extremo da mesma linha ou coluna.

### Destaque e tema

O destaque usa o estado `:focus` do St: o botão com foco de teclado é o destacado. Mover o mouse sobre um botão também passa o foco para ele, então teclado e mouse compartilham o mesmo destaque.

O botão destacado recebe a cor de destaque e uma borda mais forte (transição de 200 ms no CSS). Não há sombra: no St, `box-shadow` com desfoque não acompanha os cantos arredondados e aparece como um quadrado borrado. Ao ganhar o foco, ele também cresce para 110% com `ease()` (`EASE_OUT_BACK`, 200 ms) e é colocado por cima dos vizinhos; ao perder o foco, volta ao tamanho normal. O fator e a duração ficam em `FOCUS_SCALE` e `FOCUS_TIME` em [extension.js](extension.js).

As cores vêm de `stylesheet-dark.css` e `stylesheet-light.css`. O GNOME Shell carrega a variante correspondente ao estilo atual e a recarrega quando ele muda. `stylesheet.css` é uma cópia da variante escura, usada caso a variante não seja encontrada. O destaque usa `-st-accent-color` e `-st-accent-fg-color`, que acompanham a cor de destaque escolhida nas Configurações do GNOME.

Tamanho, arredondamento e disposição são configuráveis, por isso são aplicados como estilo inline e posições calculadas no código, e não ficam nos arquivos CSS.

### Confirmação

Se a ação escolhida pede confirmação (`confirm-mode` e `confirm-list`), o menu não fecha. Em vez disso, dentro da mesma tela:

1. o painel de botões some com uma animação, e uma camada preta extra (`.fgm-dim`) escurece mais o fundo;
2. aparece um painel com o botão da ação, no mesmo formato do menu e 25% maior, o texto da contagem, uma barra de progresso que esvazia de forma contínua e os botões **Cancelar** e **Confirmar** (este com o nome da ação);
3. um temporizador de 1 segundo atualiza o texto. Ao chegar a zero, ou ao clicar em Confirmar, a ação é executada;
4. Cancelar, `Esc` ou um clique fora do painel interrompem a contagem e trazem o menu de volta.

A confirmação é da própria extensão e não usa a janela de desligamento do GNOME, então funciona da mesma forma para qualquer ação, inclusive bloquear e suspender.

### Execução das ações

O menu fecha (sem animação) antes de executar a ação, para não ficar por cima da tela de bloqueio ou dos diálogos do sistema.

| Ação | Chamada |
|---|---|
| Bloquear | `SystemActions.activateLockScreen()` |
| Sair | `org.gnome.SessionManager.Logout(1)` (sem a janela do GNOME) |
| Suspender | `SystemActions.activateSuspend()` |
| Hibernar | `org.freedesktop.login1.Manager.Hibernate(true)` |
| Trocar usuário | `SystemActions.activateSwitchUser()` |
| Reiniciar | `org.freedesktop.login1.Manager.Reboot(true)` |
| Desligar | `org.freedesktop.login1.Manager.PowerOff(true)` |
| Personalizada | `GLib.shell_parse_argv()` + `Util.spawn()` (veja abaixo) |

O GNOME 50 não tem mais um método no `gnome-session` para reiniciar ou desligar sem abrir a janela de confirmação dele. Como a confirmação, quando ativada, é feita pela própria extensão, ela chama o logind (systemd) diretamente. O argumento `true` permite que o polkit peça senha quando necessário, por exemplo, se houver outros usuários conectados. Veja a consequência em [Problemas conhecidos](#problemas-conhecidos).

A disponibilidade de cada ação vem das propriedades de `SystemActions` (`canLockScreen`, `canSuspend`, `canSwitchUser`, `canRestart`, `canPowerOff`). Hibernar não existe em `SystemActions`: ao abrir o menu, a extensão pergunta ao logind (`CanHibernate`, de forma assíncrona) e o botão fica desativado até a resposta ser `yes` ou `challenge`. A consulta é cancelada se o menu fechar antes.

### Ações personalizadas

Cada ação personalizada guarda nome, ícone e uma linha de comando em `custom-actions`. Ao ser acionada:

1. a linha é dividida em argumentos com `GLib.shell_parse_argv()`, que entende aspas e barras invertidas como um shell;
2. o programa é iniciado com `Util.spawn()` do GNOME Shell, que procura no `PATH` e mostra uma notificação se não conseguir iniciar.

**Nenhum shell é executado.** `echo oi; rm -rf ~` vira o comando `echo` com os argumentos `oi;`, `rm`, `-rf` e `~`, sem expansão de variáveis, pipes, redirecionamentos ou `;`. Para usar esses recursos, peça um shell explicitamente: `sh -c "xset dpms force off"`.

Na janela de preferências, o diálogo de edição:

- exige nome e um comando com aspas fechadas;
- avisa se o programa não estiver no `PATH`;
- mostra uma prévia do ícone e avisa se ele não existir no tema (o menu usa `system-run-symbolic` no lugar).

Nomes e comandos são exibidos como texto puro, sem interpretar marcação.

### Cor de destaque própria

Por padrão o destaque segue a cor de destaque do GNOME (`-st-accent-color`). Com `highlight-color` definida, ela é aplicada por estilo inline no botão selecionado, no botão grande da confirmação, no botão Confirmar e na barra de progresso. A cor do texto (preto ou branco) é escolhida pela luminância, para manter o contraste. O valor só chega ao CSS se for exatamente `#rrggbb`; qualquer outra coisa é ignorada, o que impede injetar CSS pela configuração.

### Idioma

As strings são marcadas com `_()` e o domínio gettext `fast-gnome-menu` é declarado no `metadata.json`. O GNOME Shell procura os arquivos `.mo` em `locale/` dentro da pasta da extensão, de acordo com o idioma da sessão.

## Estrutura do projeto

```
fast-gnome-menu/
├── metadata.json          # UUID, versões suportadas, schema e domínio gettext
├── extension.js           # Menu, navegação, ícone na barra e execução das ações
├── prefs.js               # Janela de preferências (GTK 4 + libadwaita)
├── actions.js             # Catálogo de ações (nome, ícone, tecla), usado pelos dois acima
├── stylesheet-dark.css    # Estilo do tema escuro
├── stylesheet-light.css   # Estilo do tema claro
├── stylesheet.css         # Cópia do escuro, usada se a variante não for encontrada
├── schemas/
│   └── org.gnome.shell.extensions.fast-gnome-menu.gschema.xml
├── po/
│   ├── fast-gnome-menu.pot   # Modelo de tradução
│   ├── pt_BR.po
│   └── es.po
├── tests/
│   ├── smoke.sh           # Teste automático numa sessão headless, com screenshots
│   └── devtools/          # Extensão auxiliar usada só pelo teste
└── build.sh               # Compilação, instalação, testes, empacotamento e extração de strings
```

`schemas/gschemas.compiled`, `locale/` e `tests/output/` são gerados e não são versionados. O `.zip` de `./build.sh pack` não inclui `tests/`.

### Adicionando uma ação nativa

Para comandos simples, prefira uma [ação personalizada](#ações-personalizadas), que não exige mudar o código. Para uma ação nativa:

1. Adicione uma entrada em `getActions()` em [actions.js](actions.js) com nome, ícone e letra de atalho.
2. Trate o novo identificador em `_activate()` em [extension.js](extension.js) e, se houver uma propriedade de disponibilidade em `SystemActions`, inclua-a em `AVAILABILITY`.
3. Acrescente o identificador à descrição da chave `actions` no schema.
4. Rode `./build.sh pot` e traduza o novo texto nos arquivos `.po`.

## Compilação e empacotamento

Todos os passos ficam no [build.sh](build.sh):

| Comando | O que faz |
|---|---|
| `./build.sh` | Compila o schema (`gschemas.compiled`) e as traduções (`locale/*/LC_MESSAGES/*.mo`) na própria pasta |
| `./build.sh install` | Compila e instala em `~/.local/share/gnome-shell/extensions/<uuid>`, substituindo uma instalação anterior |
| `./build.sh dev` | Instala e abre um GNOME Shell aninhado numa janela, para testar o menu sem sair da sessão ([detalhes](#desenvolvimento-e-depuração)) |
| `./build.sh prefs` | Instala e reabre a janela de preferências já com o `prefs.js` novo |
| `./build.sh test` | Instala e roda o teste automático numa sessão headless ([detalhes](#teste-automático-buildsh-test)) |
| `./build.sh pack` | Compila e gera `<uuid>.shell-extension.zip`, pronto para enviar ao [extensions.gnome.org](https://extensions.gnome.org) |
| `./build.sh pot` | Extrai as strings de `extension.js`, `prefs.js` e `actions.js` para o `.pot` e atualiza os `.po` |

Depois de `./build.sh install`, a sessão atual continua usando o código antigo até o próximo login (Wayland). Para testar sem sair da sessão, use `./build.sh dev` e `./build.sh prefs`.

## Traduções

Para adicionar um idioma (exemplo: francês):

```sh
./build.sh pot                                         # garante que o .pot está atualizado
msginit -i po/fast-gnome-menu.pot -o po/fr.po -l fr_FR.UTF-8 --no-translator
# traduza as entradas msgstr em po/fr.po
./build.sh install
```

Para atualizar as traduções existentes depois de mudar textos no código, rode `./build.sh pot` e preencha as entradas novas ou marcadas como `fuzzy`.

## Desenvolvimento e depuração

No Wayland, o GNOME Shell carrega o código da extensão uma única vez por sessão. Desativar e ativar a extensão **não** recarrega o JavaScript. Por isso há dois comandos para testar sem sair da sessão.

### Menu e estilos: `./build.sh dev`

Abre um GNOME Shell completo dentro de uma janela, já com a versão atual da extensão instalada. No GNOME 49 ou mais recente isso requer os pacotes `mutter-devkit` e `dbus-daemon` (só precisa instalar uma vez). O `dbus-daemon` fornece o `dbus-run-session`, que o Fedora não instala por padrão porque usa o `dbus-broker`; os dois convivem sem problema:

```sh
sudo dnf install mutter-devkit dbus-daemon
```

Ciclo de desenvolvimento:

1. edite o código;
2. rode `./build.sh dev`;
3. teste o menu na janela que abrir, pelo ícone na barra superior ou com **`Super+Alt+X`**;
4. feche a janela e volte ao passo 1.

Detalhes:

- **As ações não são executadas, apenas registradas no log** (`Dry run: would activate power-off`). A sessão aninhada usa o mesmo barramento de sistema da máquina, então desligar ou reiniciar de verdade desligaria o seu computador. O `build.sh` liga esse modo pela variável `FAST_GNOME_MENU_DRY_RUN=1`.
- O terminal mostra apenas as mensagens desta extensão e os erros de JavaScript, com o rastro de pilha.
- O tamanho da janela é 1600×900. Para mudar: `MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720 ./build.sh dev`.
- **A sessão aninhada tem um banco de configurações próprio** (perfil dconf em `~/.cache/fast-gnome-menu/dconf-profile`, banco `~/.config/dconf/fast_gnome_menu_dev`). A cada execução, o `build.sh`:
  - copia as configurações atuais da extensão da sua sessão real, então o que você muda com `./build.sh prefs` vale na próxima execução;
  - ativa somente esta extensão, para que erros de outras extensões não poluam o log;
  - troca o atalho para `Super+Alt+X` (variável `DEV_SHORTCUT` no `build.sh`). O `Super+X` não chega à janela de teste, porque o GNOME Shell da sua sessão real o captura antes.
- As configurações da sua sessão real nunca são alteradas pelo `./build.sh dev`.
- Na janela de teste, Reiniciar e Desligar aparecem desativados, porque o sistema informa que não estão disponíveis para a sessão aninhada.
- No GNOME 48, o comando usa `--nested` em vez de `--devkit` e não precisa do `mutter-devkit`.

### Teste automático: `./build.sh test`

Roda a extensão num GNOME Shell **headless** (sem janela e sem tela), percorre alguns cenários, salva screenshots em `tests/output/` e falha se aparecer qualquer erro de JavaScript. Leva cerca de 40 segundos.

Cenários:

1. menu padrão com 4 ações e foco movido pelas setas; aciona uma ação e confere que o menu fecha e a ação foi registrada;
2. tela de confirmação, aberta e cancelada;
3. 6 ações com uma personalizada, cor de destaque própria e sem fundo do painel; aciona a ação personalizada;
4. 5 ações (face de dado), estilo claro e espaçamento maior;
5. as três abas da janela de preferências.

Isolamento:

- **D-Bus:** a sessão tem um barramento próprio (`dbus-run-session`);
- **Configurações:** um banco dconf próprio, `fast_gnome_menu_test`. O script se recusa a limpá-lo se o perfil não for o de teste;
- **Arquivos:** um `XDG_DATA_HOME` temporário, apagado no fim;
- **Ações:** rodam em dry-run, sem executar nada de verdade.

Para controlar o Shell pelo D-Bus (`org.gnome.Shell.Eval` e `Screenshot`), o teste instala só nessa sessão temporária a extensão auxiliar `tests/devtools/`, que liga o "unsafe mode" do GNOME Shell. Ela nunca é instalada na sua sessão nem vai no `.zip`.

Requer `dbus-daemon` (para o `dbus-run-session`) e `dbus-tools` (para o `dbus-update-activation-environment`, que escolhe a aba das preferências); não precisa do `mutter-devkit`.

### Preferências: `./build.sh prefs`

As preferências rodam num processo separado do Shell, então não precisam da sessão aninhada. O comando instala a extensão, encerra o processo de preferências (que guarda o `prefs.js` antigo em cache) e abre a janela de novo.

### Logs

Logs do GNOME Shell da sessão atual (erros aparecem com o prefixo `[fast-gnome-menu@wvmj-dev.github.io]`):

```sh
journalctl -f -o cat /usr/bin/gnome-shell
```

Logs da janela de preferências (rode o comando abaixo e abra as preferências em seguida):

```sh
journalctl -f -o cat --user
```

## Problemas conhecidos

- **Reiniciar e desligar não avisam os aplicativos.** Como a chamada vai direto ao logind, o GNOME não pergunta aos aplicativos abertos se há algo a salvar, mesmo com a confirmação da extensão ativada. Salve o trabalho antes, ou use a confirmação como lembrete.
- **Hibernar costuma aparecer desativado.** O logind só permite hibernar com uma partição ou arquivo de swap grande o bastante e, em muitas distribuições, com configuração extra. Sem isso, o botão fica esmaecido.
- **O atalho padrão `Super+X` pode conflitar** com outro atalho personalizado. Nesse caso, troque-o nas preferências.
- **"Sair" sempre aparece quando está ativado**, mesmo em sistemas com um único usuário, onde o menu do GNOME o esconde. A extensão não verifica a política `org.gnome.desktop.lockdown disable-log-out`.
