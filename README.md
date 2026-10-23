# dsh-ssh-remote

缁?**DeepSeek Harness锛圖SH锛?* 鏅鸿兘浣撶敤鐨?SSH 鑳藉姏锛氭墽琛屽懡浠ゃ€佷笂浼犱笅杞芥枃浠讹紝**绉侀挜/鍙ｄ护涓嶈繘鍏ユā鍨嬩笂涓嬫枃**銆?鑷甫渚ф爮闈㈡澘锛氫富鏈虹鐞嗐€佽繛鎺ユ祴璇曚笌杩炴帴鏃ュ織銆佸懡浠ら粦鍚嶅崟銆佸嵄闄╁懡浠ょ瓥鐣ャ€佸璁¤褰曘€?
- 浼犺緭灞傦細`ssh2`锛堥粯璁わ紝璺ㄥ钩鍙颁竴鑷淬€佽繛鎺ュ鐢ㄣ€佸師鐢?SFTP锛? 绯荤粺 OpenSSH锛堝彲閫夊悗绔級
- 褰㈡€侊細DSH bundle锛圚ost 鍗婂尯 + Client 鍗婂尯锛夛紝涓€涓寘鍚屾椂鎻愪緵宸ュ叿涓?UI
- 渚濊禆锛氫粎 `ssh2`锛涚己澶辨椂鑷姩闄嶇骇鍒扮郴缁?OpenSSH 瀹㈡埛绔?
---

## 1. 瀹冭В鍐充粈涔堥棶棰?
璁╂櫤鑳戒綋鑳界洿鎺ユ搷浣滄湇鍔″櫒锛堥儴缃层€佹帓闅溿€佷紶鏂囦欢锛夛紝浣?*妯″瀷姘歌繙鐪嬩笉鍒板瘑閽?*锛?
| 瑙掕壊 | 鑳界湅鍒颁粈涔?|
|---|---|
| 妯″瀷 / 瀵硅瘽 | 鍙湁涓绘満鍒悕锛堝 `9929`锛夊拰鍛戒护杈撳嚭 |
| 娴忚鍣ㄩ潰鏉?| 鍒悕銆佸湴鍧€銆佽璇?*寮曠敤鍚?*锛堢幆澧冨彉閲忓悕 / 鍑嵁鍚?/ 绉侀挜璺緞锛夛紝涓嶅洖鏄惧瘑閽ュ唴瀹?|
| Host 杩涚▼ | 鐪熸鐨勭閽ヤ笌鍙ｄ护锛涘彧鍦ㄦ湰鏈哄唴瀛橀噷鐢ㄤ簬鎻℃墜 |

---

## 2. 蹇€熷紑濮嬶紙3 姝ワ級

1. **瀹夎**锛堣 搂3锛夆啋 鍒锋柊 DSH 椤甸潰 鈫?宸︿晶鏍忓嚭鐜?`SSH` 鍥炬爣
2. **鍔犱富鏈?*锛氶潰鏉裤€屾柊澧炪€嶁啋 濉埆鍚?鍦板潃/鐢ㄦ埛 鈫?璁よ瘉鏂瑰紡閫夈€岀洿鎺ョ矘璐寸閽ャ€嶆垨銆岀洿鎺ヨ緭鍏ュ瘑鐮併€嶁啋 **娴嬭瘯杩炴帴** 鈫?淇濆瓨
3. **璁╂櫤鑳戒綋骞叉椿**锛氬湪瀵硅瘽閲岃

   > 杩炴帴 9929锛屽府鎴戦儴缃茶繖涓湇鍔?https://github.com/xxx/yyy

   妯″瀷浼氳嚜宸辫皟鐢?`ssh_hosts` / `ssh_exec` / `ssh_put`锛屽叏绋嬪彧鐢ㄥ埆鍚嶃€?
---

## 3. 瀹夎涓庨儴缃?
涓夌鏂瑰紡锛屾寜銆岃兘鍚﹁仈缃戙€嶃€屾槸鍚︽効鎰忔壒鏋勫缓鑴氭湰銆嶉€夈€傚畬鏁寸増瑙?**[DEPLOY.md](./DEPLOY.md)**銆?
### 鏂瑰紡 A锛氭嫹璐濊嚜甯︿緷璧栫殑鐩綍锛堟帹鑽愶紝绂荤嚎鍙敤锛?
```bash
# 鍦ㄦ湁缃戠粶鐨勬満鍣ㄤ笂鍏堟瀯寤轰竴娆★紙浼氱敓鎴?dist/dsh-ssh-remote锛屽惈 node_modules锛?git clone https://github.com/Dalld/dsh-ssh-remote.git
cd dsh-ssh-remote
npm install --omit=dev --ignore-scripts
npm run prepare:dist        # 浜х墿锛歞ist/dsh-ssh-remote
```

鎶?`dist/dsh-ssh-remote` 鏁翠釜鐩綍鎷峰埌鐩爣鏈猴紝鐒跺悗鍦ㄧ洰鏍囨満 DSH 閲岋細

```
plugin_manager install_bundle D:\dsh-plugins\dsh-ssh-remote
```

鐩綍瀹夎璧?`link:`锛屼笉浼氶噸瑁呬緷璧栵紝**涓嶄細瑙﹀彂鏋勫缓瀹℃壒**锛岄€傚悎绂荤嚎/鍐呯綉銆?
### 鏂瑰紡 B锛氱洿鎺ユ寚鍚戞簮鐮佺洰褰曪紙寮€鍙戠敤锛?
```bash
git clone https://github.com/Dalld/dsh-ssh-remote.git
cd dsh-ssh-remote
npm install --omit=dev --ignore-scripts   # ssh2 绾?JS 鍗冲彲锛屼笉闇€瑕佺紪璇?```

```
plugin_manager install_bundle <浠撳簱缁濆璺緞>
```

### 鏂瑰紡 C锛歯pm 鍖?/ 鎻掍欢甯傚満

```bash
npm i -g dsh-ssh-remote   # 鎴栧彂甯冨埌甯傚満鍚庣敱甯傚満瀹夎
```

鐩爣鏈哄畨瑁呮椂 pnpm 浼氳嚜鍔ㄨ `ssh2`锛岄娆″彲鑳芥彁绀?`pendingBuilds: cpu-features, ssh2`
锛堝彲閫夊師鐢熷姞閫熸ā鍧楋級銆傚厑璁稿嵆鍙紱涓嶅厑璁镐篃鑳界敤锛屾彃浠惰嚜鍔ㄩ€€鍥?OpenSSH 鍚庣銆?
### 鐜瑕佹眰

| 椤?| 瑕佹眰 |
|---|---|
| DSH | 鈮?`0.2.1-rc.2` |
| Node | 鈮?20锛圖SH 鑷甫锛?|
| 绯荤粺 | Windows 10+ / macOS / Linux |
| 鍙€?| 绯荤粺 OpenSSH 瀹㈡埛绔紙娌℃湁 ssh2 鏃朵娇鐢級 |

---

## 4. 闈㈡澘

| 鍖哄煙 | 鍐呭 |
|---|---|
| 椤舵爮 | 鎼滅储銆佸埛鏂般€佸鍏?`~/.ssh/config`銆佹柊澧?|
| 宸︽爮 | 涓绘満鍒楄〃锛堟寚绾规槸鍚﹀凡璁板綍銆佸彧璇绘爣璁般€佸垎缁勮繃婊わ級 |
| 鍙虫爮 | 涓绘満璇︽儏 + **娴嬭瘯杩炴帴**锛堝惈杩炴帴鏃ュ織锛? 缂栬緫/鍒犻櫎 |
| 绛栫暐鍗?| 浼犺緭鍚庣銆佸嵄闄╁懡浠ょ瓥鐣ャ€佷富鏈烘寚绾圭瓥鐣ャ€佽繛鎺ュ鐢?|
| 榛戝悕鍗曞崱 | 姝ｅ垯鍙鍒犮€佸彲鎭㈠榛樿锛堝唴缃?20 鏉★紝鍚?PowerShell 瑙勫垯锛?|
| 鏈€杩戞椿鍔?| 鎶樺彔鐨勫璁℃憳瑕?|

**娴嬭瘯杩炴帴**浼氱湡鐨勮繛涓€娆″苟杈撳嚭鏃ュ織锛屼緥濡傦細

```
[    0ms] 鍚庣 ssh2 路 鐩爣 root@1.2.3.4:22
[    0ms] 绛栫暐锛氭寚绾?accept-new 路 瓒呮椂 20000ms
[    0ms] 宸茶褰曚富鏈烘寚绾?SHA256:s2OgX2EON...
[ 1729ms] 鎻℃墜瀹屾垚 路 涓绘満瀵嗛挜 SHA256:s2OgX2EON...
[ 1729ms] 涓绘満鎸囩汗涓庤褰曚竴鑷?[ 1729ms] 璁よ瘉鎴愬姛 路 鏂瑰紡 password:cred
[ 3317ms] 杩滅鍥炴樉 exit 0 路 1588ms
[ 3317ms] 瀹屾垚
```

---

## 5. 宸ュ叿锛堟ā鍨嬪彲瑙侊級

| 宸ュ叿 | 浣滅敤 |
|---|---|
| `ssh_hosts` | 鍒楀嚭鍒悕銆佽璇佹柟寮忋€佸彧璇?鍒嗙粍銆佸凡璁板綍鎸囩汗锛沗probe: true` 鐪熷疄杩炴帴 |
| `ssh_exec` | 鎵ц鍛戒护锛堟敮鎸?`stdin`銆乣cwd`銆佽秴鏃躲€佽緭鍑轰笂闄愶級 |
| `ssh_put` / `ssh_get` | 涓婁笅浼狅紱`recursive` 浼犵洰褰曪紝`verify` 姣斿 sha256 |
| `ssh_doctor` | 璇婃柇锛氬彲鐢ㄤ紶杈撳眰涓庣増鏈€佹暟鎹洰褰曘€乲nown_hosts銆侀€愪富鏈哄氨缁儏鍐?|

鍙傛暟 schema 閲?*娌℃湁浠讳綍瀵嗛挜瀛楁** 鈥斺€?妯″瀷鑳界粰鐨勬渶鏁忔劅鎯呮姤鍙槸涓€涓埆鍚嶃€?
---

## 6. 瀹夊叏妯″瀷

1. **璁よ瘉鏉愭枡鍙湪 Host 杩涚▼瑙ｆ瀽**锛屽叡鍏鏉ユ簮锛?   `keyCred`锛堥潰鏉跨矘璐寸閽?鈫?DSH 鍑嵁搴擄級銆乣passwordCred`锛堥潰鏉胯緭鍏ュ瘑鐮?鈫?鍑嵁搴擄級銆?   `keyEnv` / `passwordEnv`锛堢幆澧冨彉閲忓悕锛夈€乣keyPath`锛堟湰鏈虹閽ユ枃浠讹級銆乣agent`锛坰sh-agent锛夈€?2. **鍑哄彛缁熶竴鑴辨晱**锛氱瀵嗗€?鈫?`[redacted:secret]`锛宍dataDir`/绉侀挜璺緞/涓存椂璺緞 鈫?`[redacted:path]`锛?   PEM 鍧?鈫?`[redacted:private-key]`銆傚伐鍏风粨鏋溿€侀敊璇俊鎭€佽繛鎺ユ棩蹇楅兘杩囪繖涓€灞傘€?3. **TOFU 鎸囩汗**锛歚accept-new` 涓嬮娆¤繛鎺ユ垚鍔熷嵆璁板綍鎸囩汗锛屼箣鍚庢瘡娆℃瘮瀵癸紱涓嶄竴鑷寸洿鎺ユ嫆缁濊繛鎺ャ€?4. **瀹¤**锛歚<dataDir>/audit.jsonl`锛?600锛夎褰?exec/put/get/probe 鐨勬椂闂淬€侀€€鍑虹爜銆佽€楁椂銆佽劚鏁忓懡浠ゃ€?5. **鍛戒护绛栫暐**锛歚dangerPolicy: deny | ask | allow`锛屽懡涓粦鍚嶅崟鏃舵嫆缁?/ 杞?DSH 瀹℃壒 / 鏀捐锛?   涓绘満鍙 `mode: readonly` 鎷掔粷鍐欐搷浣溿€?
> 杈圭晫锛氭櫤鑳戒綋鑷繁鏈夋枃浠惰鍐欏伐鍏凤紝纾佺洏涓婂瓨鍦ㄧ殑绉侀挜瀹冩湰鏉ュ氨鑳借銆傛湰鎻掍欢淇濊瘉鐨勬槸
> 銆屼笉鏂板鍓湰銆佷笉鎵撳嵃浣嶇疆銆佷笉鎶婂瘑閽ュ杩涚粨鏋溿€嶃€傞粦鍚嶅崟涓庡彧璇绘ā寮忔槸妯″紡鍖归厤锛?*涓嶆槸娌欑**銆?
---

## 7. 閰嶇疆鍙傝€?
鍐欏湪鎻掍欢琛岀殑 `config`锛圷AML锛夛紝鎴栬闈㈡澘鍐?`<dataDir>/settings.json`锛堥潰鏉夸紭鍏堢骇鏇撮珮锛屽嵆鏃剁敓鏁堬級銆?
```yaml
config:
  transport: ssh2            # ssh2 | openssh | auto
  hostKeyPolicy: accept-new  # accept-new | strict | off
  dangerPolicy: deny         # allow | ask | deny
  audit: true
  multiplex: false           # 浠?OpenSSH 鍚庣锛圥OSIX锛?  defaultTimeoutMs: 30000
  connectTimeoutMs: 20000
  maxOutputBytes: 200000
  hosts:
    - alias: prod
      host: 1.2.3.4
      port: 22
      user: root
      keyCred: DSH_SSH_PROD_KEY   # 闈㈡澘绮樿创绉侀挜鍚庤嚜鍔ㄧ敓鎴愮殑寮曠敤鍚?      mode: readonly              # default | readonly
      group: prod
    - alias: winbox
      host: 10.0.0.12
      user: Administrator
      keyPath: C:\Users\me\.ssh\id_ed25519
      shell: powershell           # posix | powershell | cmd
```

鍗曚富鏈哄彲閫夛細`keyEnv` `keyPath` `keyCred` `passphraseEnv` `passwordEnv` `passwordCred` `agent`
`timeoutMs` `connectTimeoutMs` `maxOutputBytes` `defaultCwd` `shell` `mode` `group` `enabled`銆?
閰嶇疆鏄?*涓ユ牸**鐨勶細鏈煡瀛楁銆侀潪娉?host/user/port銆佸潖 JSON 閮戒細鏄庣‘鎶ラ敊锛屼笉闈欓粯蹇界暐銆?
### 鏁版嵁鐩綍

`<profile>/ssh/`锛歚hosts.json`銆乣known_hosts`銆乣settings.json`銆乣audit.jsonl`銆乣cm/`锛圤penSSH 澶嶇敤濂楁帴瀛楋級銆?
杩佺Щ鍒版柊鏈哄櫒鏃讹紝鍓嶄笁涓枃浠跺彲鏁寸洰褰曟嫹璐濓紱**鍑嵁搴撻噷鐨勫瘑閽?瀵嗙爜涓嶅彲杩佺Щ**锛岄渶瑕侀噸濉紝
鎴栨敼鐢?`keyPath` / `keyEnv`銆?
---

## 8. 涓庡悓绫绘柟妗堢殑姣旇緝

| | 鏈彃浠讹紙ssh2 榛樿锛?| 绾?OpenSSH CLI | 妗岄潰缁堢锛圵ezTerm/Tabby锛?|
|---|---|---|---|
| 妯″瀷鍙敤 | 鉁?宸ュ叿鍖?| 鉁?浣嗛渶鑷繁鎷煎懡浠?| 鉂?|
| 杩炴帴澶嶇敤 | 鉁?杩涚▼鍐呰繛鎺ユ睜 | 浠?POSIX | 鉁?|
| SFTP | 鉁?鍘熺敓 | scp | 鉁?|
| 瀵嗛挜闅旂 | 鉁?涓嶈惤鐩樸€佽劚鏁?| 鉁?鏂囦欢 | 鈥?|
| 绠楁硶闈?| libssh2锛團IDO/鏂?KEX 婊炲悗锛?| 璺熺郴缁?| 涓よ€呯殕鏈?|

`transport: auto` 浼氬湪 ssh2 缂哄け鏃惰嚜鍔ㄩ檷鍒?OpenSSH銆?
---

## 9. 宸茬煡闄愬埗

- 榛戝悕鍗?鍙鏄ā寮忓尮閰嶏紝鑳借缁曡繃锛涗笉瑕佸綋浣滃畨鍏ㄨ竟鐣屻€?- `known_hosts` 鍙鐞嗘湰鎻掍欢鍐欏叆鐨勬槑鏂囨潯鐩紙鍝堝笇鍖?`|1|鈥 鏉＄洰鍖归厤涓嶅埌锛夈€?- Windows 涓?OpenSSH 鍚庣娌℃湁杩炴帴澶嶇敤涓庡彲闈犲彛浠よ璇侊紙鐢?ssh2 鍗冲彲锛夈€?- 鐩綍閫掑綊浼犺緭銆佹柇鐐圭画浼犮€佺鍙ｈ浆鍙戝伐鍏峰皻鏈疄鐜般€?- 闈㈡澘鏂囨鐩墠涓轰腑鏂囷紝鏈蛋 Client locale 鏈嶅姟銆?
---

## 10. 寮€鍙?
```bash
npm install --omit=dev --ignore-scripts
node test/smoke.mjs     # 绂荤嚎娴嬭瘯锛氬伐鍏锋敞鍐屻€佺瓥鐣ャ€佹寚绾瑰簱銆佽缃€侀潰鏉?API銆佽劚鏁?```

鐪熸満楠岃瘉璁板綍瑙?[DEPLOY.md](./DEPLOY.md#楠岃瘉娓呭崟瑁呭畬鑷) 涓庢彁浜ゅ巻鍙层€?
## License

MIT