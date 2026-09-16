# Agrega el onesignal-gradle-plugin a los build.gradle del proyecto Android (Capacitor)
p='android/build.gradle'
s=open(p).read()
if 'onesignal-gradle-plugin' not in s:
    s=s.replace('dependencies {', "dependencies {\n        classpath 'gradle.plugin.com.onesignal:onesignal-gradle-plugin:[0.14.0, 0.99.99]'", 1)
    open(p,'w').write(s)
    print('classpath agregado en android/build.gradle')

p='android/app/build.gradle'
s=open(p).read()
if 'onesignal-gradle-plugin' not in s:
    s="apply plugin: 'com.onesignal.androidsdk.onesignal-gradle-plugin'\n"+s
    open(p,'w').write(s)
    print('apply plugin agregado en android/app/build.gradle')

print('Gradle de OneSignal listo')
