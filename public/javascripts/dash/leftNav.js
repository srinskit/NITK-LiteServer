if (navConVisible) {
    $('#navToggler').text('<')
    $('#navContainer').show()
} else {
    $('#navContainer').hide()
    $('#navToggler').text('>')
}
runAnime = function () {
    navConVisible = !navConVisible
    $('#navContainer').animate({
        width: 'toggle'
    }, 200, function () {
        if (navConVisible) {
            $('#navToggler').text('<')
        } else {
            $('#navToggler').text('>')
        }
    })
}
var msgQueue = [],
    msgQueueHasError = false;

function pushMsg(data) {
    msgQueue.push(data.type + ': ' + data.msg);
    if (data.type === 'error' && !msgQueueHasError) {
        msgQueueHasError = true;
        $('#msgImg').attr('src', '/images/msg_err.png');
    } else if (msgQueue.length === 1) $('#msgImg').attr('src', '/images/msg_new.png');
}
$('#msgImg').click(function () {
    if (msgQueue.length > 0) {
        $('#msgImg').attr('src', '/images/msg.png');
        // Non blocking alert
        setTimeout(function () {
            alert(msgQueue.join('\n'));
            msgQueue = [];
            msgQueueHasError = false;
        }, 1);
    }
});
$('#navToggler').click(runAnime)
$('#content').click(function () {
    if (navConVisible) {
        runAnime()
    }
})
