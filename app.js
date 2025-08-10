
const now = new Date();
document.getElementById('app').innerHTML = '<h1>GA2 App Loaded with date-fns!</h1>' +
    '<p>Today is: ' + dateFns.format(now, 'yyyy-MM-dd') + '</p>';
