EXTERNAL clear()
-> start
= boot
#speed 1
TRAC PC-9800 Series System Terminal
Reythorne OS Version 6.20
Copyright (C) 2981, 2987 Reythorne Corp. / TRAC Corporation

EEEE I3000000032940xf100110303B77500EEEE I400000004294_M8_BL1_10221D113B323EEEE5
no sdio debug board detected 
TE : 102609
BT : 11:30:18 Mar 14 2314
                              
Boot From SPI      
#clear                                                             
ucl decompress...pass                                                           
0x12345678                                                                      
Boot from internal device 1st SPI                                               
 
TE : 512897    
-> start                                                                 
= start
System Started                  
#speed 20
......................... #asd 32
#delay 100
#speed 40
ENTER PASSWORD
#password 123
-> main

= main
#clear  #title
Greta base
+ Diagnostic
  -> diagnostics ->
+ Controls
  -> controls ->
+ Comms
  -> comms ->
+ Reboot
  -> boot
- -> main

= diagnostics
Generator [off]
backup generator [off]
+ [back] ->->
= controls
Airlock [closed]
 #delay
->->
= comms
Comms [off]
 #delay
->->
