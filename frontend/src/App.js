import React, {useEffect} from 'react';
import {ReactKeycloakProvider, useKeycloak} from "@react-keycloak/web";
import {
    Container,
    CssBaseline,
    Dialog,
    DialogContent,
    DialogContentText,
    DialogTitle, useMediaQuery,
} from "@mui/material";

import keycloak from "./keycloak";
import "@fontsource/roboto"
import './App.css';
import ShareList from "./components/ShareList";
import {BrowserRouter, Route, Switch} from "react-router-dom";
import AddShare from "./components/AddShare";
import DropFile from "./components/DropFile";
import {LocalizationProvider} from "@mui/lab";
import DateAdapter from '@mui/lab/AdapterMoment';
import {createTheme, ThemeProvider} from "@mui/material/styles";
import RequestShare from "./components/RequestShare";

function AuthorizationBarrier(props) {
    const {keycloak} = useKeycloak();

    useEffect(() => {
        if(!keycloak.authenticated) keycloak.login();
    }, [keycloak.authenticated])

    const isAuthorized = keycloak.tokenParsed?.roles?.includes('member');

    if(isAuthorized) {
        return (
            props.children
        );
    }
    else {
        return (
            <Dialog open={true}>
                <DialogTitle>Unauthorized</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You dont have the permission to use this service.
                    </DialogContentText>
                </DialogContent>
            </Dialog>
        );
    }
}

function App() {
    const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

    const theme = React.useMemo(
        () =>
            createTheme({
                palette: {
                    mode: prefersDarkMode ? 'dark' : 'light'
                }
            }
    ), [prefersDarkMode]);

    return (
      <ReactKeycloakProvider authClient={keycloak} LoadingComponent={<React.Fragment />} initOptions={{
        onLoad: '',
        promiseType: 'native',
        flow: 'standard',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      }}>
          <ThemeProvider theme={theme}>
              <LocalizationProvider dateAdapter={DateAdapter}>
              <CssBaseline />
                <BrowserRouter>
                    <Switch>
                        <Route path={"/r/:id"}>
                            <Container sx={{
                                marginTop: '4em',
                                marginBottom: '4em',
                            }} maxWidth={"sm"}>
                                <RequestShare />
                            </Container>
                        </Route>
                        <Route>
                            <AuthorizationBarrier>
                                <DropFile>
                                    <Container sx={{
                                        marginTop: '4em',
                                        marginBottom: '4em',
                                    }} maxWidth={"sm"}>
                                      <Switch>
                                        <Route path={'/'} exact>
                                          <ShareList />
                                        </Route>
                                        <Route path={'/add'}>
                                          <AddShare />
                                        </Route>
                                      </Switch>
                                    </Container>
                                </DropFile>
                            </AuthorizationBarrier>
                        </Route>
                    </Switch>
                </BrowserRouter>
              </LocalizationProvider>
          </ThemeProvider>
      </ReactKeycloakProvider>
  );
}

export default App;
