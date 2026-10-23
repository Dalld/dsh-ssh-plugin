# 閮ㄧ讲鍒板彟涓€鍙扮數鑴?
鎻掍欢鏈綋鏄?`dsh-ssh-remote`锛圚ost 鍗婂尯 + Client 鍗婂尯 + 鍙€夌殑 `ssh2` 渚濊禆锛夈€?涓夌瑁呮硶鎸夈€岃兘涓嶈兘鑱旂綉銆嶃€屾兂涓嶆兂鍔ㄦ瀯寤鸿剼鏈€嶅尯鍒嗐€?
## 鏂瑰紡 A锛氭嫹璐濊嚜甯︿緷璧栫殑鐩綍锛堟帹鑽愶紝绂荤嚎鍙敤锛屼笉纰版瀯寤哄鎵癸級

鍏堢敓鎴愬彂甯冪洰褰曪紙鏈夌綉缁滅殑涓€渚у仛涓€娆″嵆鍙級锛?
```bash
git clone https://github.com/Dalld/dsh-ssh-remote.git
cd dsh-ssh-remote
npm run prepare:dist      # 浜у嚭 dist/dsh-ssh-remote锛堝惈 node_modules/ssh2锛?```

涔熷彲浠ユ墜宸ユ潵锛歚npm install --omit=dev --ignore-scripts`锛岀劧鍚庢妸
`index.js client.js lib locale cordis.patch.yml icon.svg package.json node_modules` 涓€璧锋嫹杩涗竴涓洰褰曘€?
1. 鎶婃暣涓?`dist/dsh-ssh-remote` 鐩綍鎷峰埌鐩爣鏈哄櫒锛屼緥濡?`D:\dsh-plugins\dsh-ssh-remote`
2. 鎵撳紑鐩爣鏈?DSH 鈫?璁剧疆 鈫?鎻掍欢 鈫?瀹夎锛堟湰鍦扮洰褰曪級锛屾垨鍦ㄦ彃浠剁鐞嗛噷鎵ц锛?   `plugin_manager install_bundle D:\dsh-plugins\dsh-ssh-remote`
3. **鍒锋柊涓€娆￠〉闈?*锛屽乏渚ф爮鍑虹幇 SSH 鍥炬爣
4. 闈㈡澘 鈫?鏂板涓绘満 鈫?璁よ瘉鏂瑰紡閫夈€岀洿鎺ョ矘璐寸閽ャ€嶆垨銆岀洿鎺ヨ緭鍏ュ瘑鐮併€嶁啋 娴嬭瘯杩炴帴 鈫?淇濆瓨

涓轰粈涔堟帹鑽愯繖鏉★細鐩綍瀹夎鏄?`link:` 鏂瑰紡锛宲npm 涓嶉噸瑁呬緷璧栵紝涔熷氨涓嶄細瑙﹀彂 `ssh2` / `cpu-features`
閭ｄ袱涓彲閫夊師鐢熸ā鍧楃殑鏋勫缓瀹℃壒锛沗node_modules/ssh2` 宸茬粡韬哄湪鐩綍閲岋紝绾?JS 灏辫兘璺戙€?
## 鏂瑰紡 B锛歵arball / npm 鍖咃紙闇€瑕佽仈缃?+ 涓€娆℃€ф壒鍑嗘瀯寤猴級

`plugins/dsh-ssh-remote-0.7.0.tgz`锛?4 KB锛屼笉鍚緷璧栵級銆?
1. `plugin_manager install_bundle <璺緞>\dsh-ssh-remote-0.7.0.tgz`
2. 棣栨浼氳繑鍥?`pendingBuilds: ["cpu-features@0.0.10", "ssh2@1.17.0"]`锛屽睘浜庡彲閫夊師鐢熷姞閫熸ā鍧楋紱
   鍦ㄦ彃浠堕〉鍏佽杩欎簺鏋勫缓鑴氭湰鍚庨噸璇曞嵆鍙€?3. 涓嶆壒鍑嗕篃骞堕潪涓嶈兘鐢細姝ゆ椂 `ssh2` 瑁呬笉涓婏紝鎻掍欢浼?*鑷姩闄嶇骇鍒扮郴缁?OpenSSH 鍚庣**
   锛圵indows 10+ 鑷甫 OpenSSH 瀹㈡埛绔紱娉ㄦ剰 OpenSSH 鍚庣鍦?Windows 涓嶆敮鎸佽繛鎺ュ鐢ㄤ笌鍙ｄ护璁よ瘉锛夈€?
## 鏂瑰紡 C锛氬彂甯冨埌甯傚満鍚庝竴鏉″懡浠?
鍙戝竷鍒?npm锛堥渶瑕佽处鍙蜂笌鍖呭悕鎵€鏈夋潈锛夊悗锛岀洰鏍囨満锛?
```
plugin_manager install_bundle dsh-ssh-remote
```

渚濊禆鐢?pnpm 鑷姩瀹夎锛屽悓鏍蜂細閬囧埌涓€娆℃瀯寤哄鎵广€?
## 鐩爣鏈虹幆澧冭姹?
| 椤?| 瑕佹眰 |
|---|---|
| DSH | 鈮?`0.2.1-rc.2`锛坄package.json` 鐨?`engines.dsh`锛?|
| Node | 鈮?20锛圖SH 鑷甫杩愯鏃讹紝鏃犻渶鍙﹁锛?|
| 绯荤粺 | Windows 10+ / macOS / Linux锛涙柟寮?B銆丆 闇€瑕佽仈缃?|
| 鏃?ssh2 鏃?| 鑷姩鐢ㄧ郴缁?`ssh`/`scp`锛圥OSIX 鏇村畬鏁达紱Windows 鍔熻兘鍙楅檺锛?|

## 閰嶇疆涓庢暟鎹縼绉?
`<profile>/ssh/` 涓嬬殑鏂囦欢**鍙互鏁寸洰褰曟嫹璐?*锛?
| 鏂囦欢 | 鍐呭 | 鍙縼绉?|
|---|---|---|
| `hosts.json` | 鍒悕銆佸湴鍧€銆佺鍙ｃ€佺敤鎴枫€佽璇佸紩鐢ㄥ悕 | 鉁?|
| `known_hosts` | 涓绘満鎸囩汗锛圱OFU 璁板綍锛?| 鉁?|
| `settings.json` | 浼犺緭鍚庣銆佸嵄闄╁懡浠ょ瓥鐣ャ€侀粦鍚嶅崟銆佸璁″紑鍏?| 鉁?|
| `audit.jsonl` | 鎵ц鍘嗗彶 | 鍙€?|

**涓嶈兘杩佺Щ鐨?*锛氱矘璐磋繘闈㈡澘鐨勭閽?/ 瀵嗙爜 鈥斺€?瀹冧滑瀛樺湪鐩爣鏈鸿嚜宸辩殑 DSH 鍑嵁搴撻噷銆?鍒版柊鏈哄櫒瑕侀噸濉竴娆★紙鎴栨敼鐢?`keyPath` / `keyEnv`锛岃繖涓ょ鏈潵灏辨槸鏈満鏈湴璧勬簮锛夈€?
## 楠岃瘉娓呭崟锛堣瀹岃嚜妫€锛?
```bash
# 1. 鑳藉姏鐭╅樀锛氬簲鏄剧ず ssh2 鎴?openssh 鑷冲皯涓€涓?available
#    鍦ㄥ璇濋噷鐩存帴璇达細璺戜竴涓?ssh_doctor

# 2. 闈㈡澘锛氫晶鏍?SSH 鈫?鏂板涓绘満 鈫?娴嬭瘯杩炴帴锛屾棩蹇楁渶鍚庝竴琛屽簲涓恒€屽畬鎴愩€?```

甯歌闂锛?
| 鐜拌薄 | 鍘熷洜 | 澶勭悊 |
|---|---|---|
| 闈㈡澘椤堕儴 `HTTP 404 / 405` | 瀹㈡埛绔ā鍧楁病鍒锋柊 | 鍒锋柊椤甸潰锛涘啀涓嶈閲嶅惎涓€娆?DSH |
| `ssh2 缂哄け`锛屽悗绔樉绀?openssh | 鏂瑰紡 B/C 娌℃壒鍑嗘瀯寤?| 鎵瑰噯鏋勫缓锛屾垨鏀圭敤鏂瑰紡 A 鐨勭洰褰?|
| `娌℃湁鍑嵁鏈嶅姟` | 鐩爣鏈烘病鎸?credentials 鏈嶅姟 | 鏀圭敤 `keyPath` / `keyEnv` |
| 杩炴帴琚嫆涓旀彁绀烘寚绾逛笉涓€鑷?| 鏈嶅姟鍣ㄦ崲杩囦富鏈哄瘑閽?| 鍒犻櫎 `known_hosts` 涓涓绘満閭ｈ鍐嶈繛 |