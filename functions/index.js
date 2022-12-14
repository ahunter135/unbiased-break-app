/* eslint-disable */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

let leftSources = [];
let middleSources = [];
let rightSources = [];

let baseURL = "https://url-content-extractor.p.rapidapi.com/";
const options = {
    method: "GET",
    headers: {
        "X-RapidAPI-Key": "3b3d59a4b1msh9fe345204a200d6p1bf9cdjsnbc7461a03162",
        "X-RapidAPI-Host": "url-content-extractor.p.rapidapi.com"
    }
};

function getProperCollection(a) {
    let rightContains = rightSources.some(e => {
        if (a.link.includes(e)) return true;
        return false;
    })

    let middleContains = middleSources.some(e => {
        if (a.link.includes(e)) return true;
        return false;
    })

    let leftContains = leftSources.some(e => {
        if (a.link.includes(e)) return true;
        return false;
    })

    if (rightContains) return "right-articles";
    else if (middleContains) return "middle-articles";
    else if (leftContains) return "left-articles";
    else return "No Source Found";
}

async function getContent(json) {
    
    try {
        baseURL = "https://url-content-extractor.herokuapp.com/";

        let response = await fetch(baseURL + "content?url=" + json.link, options);
        let respJson = await response.json();

        return respJson;
    } catch (error) {
        return { status: 500 };
    }

}
async function doTrending() {
    try {
        await getSources();
        let response = await fetch(baseURL + "trending", options);
        let json = await response.json();
        let articles = json.articles;
        let final = [];
        for (let i = 0; i < articles.length; i++) {
            try {
                let a = articles[i];
                let collection = db.collection("trending-articles");
                let query = collection.where("link", "==", a.link);
                let docs = await query.get();

                let art = await getContent(a);
                if (art.status === 200) {
                    final.push({ ...art.article, date: new Date(a.date), rating: 0, hearts: 0, deleted: false });
                }
            } catch (error) {
                console.log(error)
            }

        }

        for (let i = 0; i < final.length; i++) {
            try {
                let a = final[i];
                let collection = db.collection("trending-articles");
                let query = collection.where("link", "==", a.link);
                let docs = await query.get();
                if (docs.empty) {
                    db.collection("trending-articles").add(a);
                }
            } catch (error) {
                console.log(error)
            }

        }
    } catch (error) {
        console.log(error)
    }

}
async function doFeed(searchTopics, flag) {
    await getSources();
    let searches = [];
    for (let i = 0; i < searchTopics.length; i++) {
        if (flag === 'left') {
            leftSources.forEach((s) => {
                let str = s.split('.')[0];
                searches.push({ topic: str + " " + searchTopics[i].topic, id: searchTopics[i].id });
            })
        } else if (flag === 'middle') {
            middleSources.forEach((s) => {
                let str = s.split('.')[0];
                searches.push({ topic: str + " " + searchTopics[i].topic, id: searchTopics[i].id });
            })
        } else if (flag === 'right') {
            rightSources.forEach((s) => {
                let str = s.split('.')[0];
                searches.push({ topic: str + " " + searchTopics[i].topic, id: searchTopics[i].id });
            });
        }
    }
    let searchTopicsResp = [];
    for (let i = 0; i < searches.length; i++) {
        try {
            searchTopicsResp.push({ article: await doSearch(searches[i]), topic: searches[i].id });
        } catch (error) {
            console.log(error);
        }
    }

    let final = [];
    for (let i = 0; i < searchTopicsResp.length; i++) {
        try {
            let aList = searchTopicsResp[i].article;
            for (let j = 0; j < aList.length; j++) {
                try {
                    let a = aList[j];
                    let art = await getContent(a);
                    if (art.status === 200) {
                        final.push({ ...art.article, date: new Date(a.date), rating: 0, hearts: 0, topic: searchTopicsResp[i].topic, deleted: false });
                    }
                } catch (error) {
                    console.log(error)
                }


            }
        } catch (error) {
            console.log(error);
        }

    }

    for (let i = 0; i < final.length; i++) {
        let a = final[i];
        let collectionName = getProperCollection(a);

        if (collectionName === 'No Source Found') {
            console.log(collectionName + ": " + a.link);
        } else {
            let collection = db.collection(collectionName);
            let query = collection.where("link", "==", a.link);
            let docs = await query.get();

            if (docs.empty) {
                await db.collection(collectionName).add(a);
            }
        }

    }
}

async function doSearch(query) {
    try {
        let response = await fetch(baseURL + "search?query=" + query.topic, options);
        let json = await response.json();
        return json;
    } catch (error) {
        return { status: 400 }
    }
}

async function deleteOldArticles() {
    return new Promise(async (resolve) => {
        let docs = await db.collection("trending-articles").get();
        let promises = [];
        docs.forEach((d) => {
            let data = d.data();
            let newDate = new Date(data.date.toDate());
            let today = new Date().toISOString().slice(0, 10)

            const startDate = newDate;
            const endDate = today;

            const diffInMs = new Date(endDate) - new Date(startDate)
            const diffInDays = diffInMs / (1000 * 60 * 60 * 24);
            if (diffInDays >= 2) {
                promises.push(db.collection("trending-articles").doc(d.id).update({
                    deleted: true
                }));
            }
        })

        Promise.all(promises).then(() => resolve());
    })
}

async function deleteMyFeedArticles() {
    return new Promise(async (resolve) => {
        let docs = await db.collection("left-articles").get();
        let promises = [];
        docs.forEach((d) => {
            let data = d.data();
            let newDate = new Date(data.date.toDate());
            let today = new Date().toISOString().slice(0, 10)

            const startDate = newDate;
            const endDate = today;

            const diffInMs = new Date(endDate) - new Date(startDate)
            const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

            if (diffInDays >= 7) {
                promises.push(db.collection("left-articles").doc(d.id).update({
                    deleted: true
                }));
            }
        })
        docs = await db.collection("middle-articles").get();
        docs.forEach((d) => {
            let data = d.data();
            let newDate = new Date(data.date.toDate());
            let today = new Date().toISOString().slice(0, 10)

            const startDate = newDate;
            const endDate = today;

            const diffInMs = new Date(endDate) - new Date(startDate)
            const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

            if (diffInDays >= 7) {
                promises.push(db.collection("middle-articles").doc(d.id).update({
                    deleted: true
                }));
            }
        })
        docs = await db.collection("right-articles").get();
        docs.forEach((d) => {
            let data = d.data();
            let newDate = new Date(data.date.toDate());
            let today = new Date().toISOString().slice(0, 10)

            const startDate = newDate;
            const endDate = today;

            const diffInMs = new Date(endDate) - new Date(startDate)
            const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

            if (diffInDays >= 7) {
                promises.push(db.collection("right-articles").doc(d.id).update({
                    deleted: true
                }));
            }
        })

        Promise.all(promises).then(() => resolve());
    })
}

async function getSources() {
    let leftDocs = await db.collection("left-sources").get();
    let midDocs = await db.collection("middle-sources").get();
    let rightDocs = await db.collection("right-sources").get();

    leftDocs.forEach((d) => leftSources.push(d.data().url));
    midDocs.forEach((d) => middleSources.push(d.data().url));
    rightDocs.forEach((d) => rightSources.push(d.data().url));

}

const runtimeOpts = {
    timeoutSeconds: 540,
    memory: '1GB'
}

exports.trendingFunction = functions.runWith(runtimeOpts).pubsub.schedule("45 */1 * * *").onRun(async (context) => {
    let promise = [doTrending()];
    return Promise.all(promise);
});

exports.topic0LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "gun", id: 0 }], 'left')];
    return Promise.all(promise);
});
exports.topic1LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "cannabis", id: 1 }], 'left')];
    return Promise.all(promise);
});

exports.topic2LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "police", id: 2 }], 'left')];
    return Promise.all(promise);
});
exports.topic3LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "abortion", id: 3 }], 'left')];
    return Promise.all(promise);
});
exports.topic4LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "economy", id: 4 }], 'left')];
    return Promise.all(promise);
});
exports.topic5LeftFunction = functions.runWith(runtimeOpts).pubsub.schedule("0 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "healthcare", id: 5 }], 'left')];
    return Promise.all(promise);
});
exports.topic0MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "gun", id: 0 }], 'middle')];
    return Promise.all(promise);
});
exports.topic1MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "cannabis", id: 1 }], 'middle')];
    return Promise.all(promise);
});

exports.topic2MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "police", id: 2 }], 'middle')];
    return Promise.all(promise);
});
exports.topic3MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "abortion", id: 3 }], 'middle')];
    return Promise.all(promise);
});
exports.topic4MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "economy", id: 4 }], 'middle')];
    return Promise.all(promise);
});
exports.topic5MiddleFunction = functions.runWith(runtimeOpts).pubsub.schedule("15 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "healthcare", id: 5 }], 'middle')];
    return Promise.all(promise);
});
exports.topic0RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "gun", id: 0 }], 'right')];
    return Promise.all(promise);
});
exports.topic1RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "cannabis", id: 1 }], 'right')];
    return Promise.all(promise);
});

exports.topic2RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "police", id: 2 }], 'right')];
    return Promise.all(promise);
});
exports.topic3RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "abortion", id: 3 }], 'right')];
    return Promise.all(promise);
});
exports.topic4RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "economy", id: 4 }], 'right')];
    return Promise.all(promise);
});
exports.topic5RightFunction = functions.runWith(runtimeOpts).pubsub.schedule("30 */1 * * *").onRun(async (context) => {
    let promise = [doFeed([{ topic: "healthcare", id: 5 }], 'right')];
    return Promise.all(promise);
});
exports.deleteTrending = functions.runWith(runtimeOpts).pubsub.schedule("every 24 hours").onRun(async (context) => {
    let promise = [deleteOldArticles()];
    return Promise.all(promise);
})
exports.deleteFeed = functions.runWith(runtimeOpts).pubsub.schedule("every 24 hours").onRun(async (context) => {
    let promise = [deleteMyFeedArticles()];
    return Promise.all(promise);
})

async function doReplyNotifification(change) {
    let userId = change.after.data().uid;
    let comments = change.after.data().comments;
    if (comments.length > 0) {
        let latestComment = comments[comments.length - 1];
        if (latestComment.uid !== userId) {
            let user = await db.collection("users").doc(userId).get();
            if (user.data().replyNotifications && user.data().token) {
                let payload = {
                    token: user.data().token,
                    notification: {
                        title: "Reply",
                        body: "A User Has Replied To Your Comment"
                    },
                    data: {
                        body: "sample data"
                    }
                }
                await admin.messaging().send(payload);
            }
        }
    }
}

async function doDailyReminder() {
    return new Promise(async (resolve) => {
        let usersRef = await db.collection("users").get();

        let promises = [];
        usersRef.forEach((u) => {
            let user = u.data();

            if (user.lastSeen && user.reminderNotifications) {
                let lastSeen = new Date(user.lastSeen.toDate());

                let today = new Date();

                const startDate = lastSeen;
                const endDate = today;
                if (
                    startDate.getFullYear() === endDate.getFullYear() &&
                    startDate.getMonth() === endDate.getMonth() &&
                    startDate.getDate() === endDate.getDate()
                ) {
                    // Do nothing
                    console.log("Doing nothing");
                } else if (user.token) {
                    let payload = {
                        token: user.token,
                        notification: {
                            title: "We Miss You!",
                            body: "Open up your app to catch up on missed news!"
                        },
                        data: {
                            body: "sample data"
                        }
                    }
                    console.log("Sending");
                    promises.push(admin.messaging().send(payload));
                    promises.push(db.collection("users").doc(u.id).update({
                        lastSeen: new Date()
                    }))
                }
            }
        })

        Promise.all(promises).then(() => resolve());
    })

}

exports.sendResponseNotificationLeft = functions.runWith(runtimeOpts).firestore.document('/left-articles/{articleId}/comments/{commentId}').onUpdate((change, context) => {
    let promise = [doReplyNotifification(change)];
    return Promise.all(promise);
})
exports.sendResponseNotificationMiddle = functions.runWith(runtimeOpts).firestore.document('/middle-articles/{articleId}/comments/{commentId}').onUpdate((change, context) => {
    let promise = [doReplyNotifification(change)];
    return Promise.all(promise);
})
exports.sendResponseNotificationRight = functions.runWith(runtimeOpts).firestore.document('/right-articles/{articleId}/comments/{commentId}').onUpdate((change, context) => {
    let promise = [doReplyNotifification(change)];
    return Promise.all(promise);
})
exports.sendResponseNotificationTrending = functions.runWith(runtimeOpts).firestore.document('/trending-articles/{articleId}/comments/{commentId}').onUpdate((change, context) => {
    let promise = [doReplyNotifification(change)];
    return Promise.all(promise);
})

exports.sendDailyReminder = functions.runWith(runtimeOpts).pubsub.schedule("0 12 * * *").onRun(async (context) => {
    let promise = [doDailyReminder()];
    return Promise.all(promise);
});